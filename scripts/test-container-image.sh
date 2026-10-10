#!/usr/bin/env bash

set -euo pipefail

image="${1:?Docker-Image als erstes Argument angeben}"
mode="${2:?Testmodus empty, example oder upgrade als zweites Argument angeben}"

if [[ "$mode" != "empty" && "$mode" != "example" && "$mode" != "upgrade" ]]; then
  echo "Unbekannter Testmodus: $mode" >&2
  exit 2
fi

container_id=""

cleanup() {
  if [[ -n "$container_id" ]]; then
    docker rm --force "$container_id" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "$mode" == "upgrade" ]]; then
  container_id="$(docker create --publish 127.0.0.1:3001:3001 "$image" \
    sh -c 'node /app/container-upgrade-seed.ts && exec node dist/server/index.js')"
  docker cp tests/container-upgrade-seed.ts "$container_id:/app/container-upgrade-seed.ts"
  docker start "$container_id" >/dev/null
else
  container_id="$(
  docker run \
    --detach \
    --publish 127.0.0.1:3001:3001 \
    "$image"
)"
fi

for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then
    ./node_modules/.bin/tsx tests/container-image-smoke.ts "$mode" http://127.0.0.1:3001
    exit 0
  fi
  sleep 1
done

docker logs "$container_id"
exit 1
