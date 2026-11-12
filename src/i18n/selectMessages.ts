import type { AbstractIntlMessages } from 'next-intl';

export function mergeMessages(
  parent: AbstractIntlMessages,
  feature: AbstractIntlMessages,
): AbstractIntlMessages {
  const merged = { ...parent };
  for (const [key, value] of Object.entries(feature)) {
    const previous = parent[key];
    merged[key] =
      value &&
      previous &&
      typeof value === 'object' &&
      typeof previous === 'object' &&
      !Array.isArray(value) &&
      !Array.isArray(previous)
        ? mergeMessages(previous, value)
        : value;
  }
  return merged;
}

export function selectMessages(
  messages: AbstractIntlMessages,
  scope: Readonly<Record<string, readonly string[]>>,
): AbstractIntlMessages {
  const selected: AbstractIntlMessages = {};
  for (const [namespace, keys] of Object.entries(scope)) {
    for (const key of keys) {
      const segments = [namespace, ...key.split('.')];
      let source: AbstractIntlMessages[string] = messages;
      let destination = selected;
      for (const segment of segments.slice(0, -1)) {
        if (typeof source !== 'object' || !source || !Object.hasOwn(source, segment))
          throw new Error(`Missing scoped message: ${namespace}.${key}`);
        source = source[segment];
        const child = destination[segment];
        if (!child || typeof child !== 'object') destination[segment] = {};
        destination = destination[segment] as AbstractIntlMessages;
      }
      const leaf = segments.at(-1)!;
      if (typeof source !== 'object' || !source || !Object.hasOwn(source, leaf))
        throw new Error(`Missing scoped message: ${namespace}.${key}`);
      // Precompiled ICU nodes are arrays at runtime; retain them verbatim.
      destination[leaf] = source[leaf];
    }
  }
  return selected;
}
