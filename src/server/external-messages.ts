type ExternalName = {
  internalName: string;
  statementGroup: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ersetzt interne Kostenbezeichnungen in einem Schritt. Dadurch kann ein neu
 * eingesetzter Gruppenname nicht versehentlich noch einmal ersetzt werden.
 */
export function externalizeCostMessages(
  messages: string[],
  names: ExternalName[],
  redactUnknownCostPrefixes = false,
): string[] {
  const replacements = new Map<string, string>();

  for (const name of names) {
    const internalName = `„${name.internalName}“`;
    const statementGroup = `„${name.statementGroup}“`;
    const existing = replacements.get(internalName);
    replacements.set(
      internalName,
      existing && existing !== statementGroup ? '„Betriebskosten“' : statementGroup,
    );
  }

  const quotedNames = [...replacements.keys()].sort((left, right) => right.length - left.length);
  const pattern = quotedNames.length
    ? new RegExp(quotedNames.map(escapeRegExp).join('|'), 'g')
    : null;
  const costPrefix = /^„[^“]+“(?=:\s| ist noch)/;

  return [
    ...new Set(
      messages.map((message) => {
        const originalPrefix = message.match(costPrefix)?.[0];
        let external = pattern
          ? message.replace(pattern, (match) => replacements.get(match) ?? match)
          : message;

        if (redactUnknownCostPrefixes && originalPrefix && !replacements.has(originalPrefix)) {
          external = external.replace(costPrefix, '„Betriebskosten“');
        }
        return external;
      }),
    ),
  ];
}
