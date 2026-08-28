#!/usr/bin/env bash

set -euo pipefail

image="${1:?Docker-Image als erstes Argument angeben}"
mode="${2:?Testmodus empty oder example als zweites Argument angeben}"

if [[ "$mode" != "empty" && "$mode" != "example" ]]; then
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

container_id="$(
  docker run \
    --detach \
    --publish 127.0.0.1:3001:3001 \
    "$image"
)"

for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then
    ./node_modules/.bin/tsx tests/container-image-smoke.ts "$mode" http://127.0.0.1:3001
    exit 0
  fi
  sleep 1
done

docker logs "$container_id"
exit 1
