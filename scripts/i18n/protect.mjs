import compile from 'icu-minify/compile';

export function literalMessage(text) {
  return text.replace(/'/g, "''").replace(/[{}#<>]/g, (character) => `'${character}'`);
}

function structure(message) {
  const body = (value) =>
    (typeof value === 'string' ? [] : Array.isArray(value) ? value : [value])
      .filter((node) => typeof node !== 'string')
      .map((node) => {
        if (!Array.isArray(node)) return node;
        if ([1, 2, 3].includes(node[1]))
          return [
            node[0],
            node[1],
            Object.fromEntries(Object.entries(node[2]).map(([key, branch]) => [key, body(branch)])),
          ];
        if (node.length > 1 && (typeof node[1] !== 'number' || node[1] === 0))
          return [node[0], body(node.slice(1))];
        return node;
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(body(compile(message)));
}

export function assertSameMessageStructure(source, translated) {
  if (structure(source) !== structure(translated))
    throw new Error('Translation changed ICU structure');
}

/** Preserve ICU controls, argument names, format styles and rich-text tags verbatim. */
export function protectMessage(message) {
  compile(message);
  if (message.includes('CTI18N')) throw new Error('Reserved translation token in source');
  const tokens = [];
  const token = (text, control = true) => {
    const name = `CTI18N${String(tokens.length).padStart(5, '0')}TOKEN`;
    tokens.push({ name, text, control });
    return name;
  };
  let cursor = 0;
  function content(inBranch = false) {
    let output = '';
    while (cursor < message.length) {
      const character = message[cursor];
      if (character === '}' && inBranch) return output;
      if (character === '{') {
        const start = cursor;
        const match = message.slice(cursor).match(/^\{\s*[^\s,{}]+\s*([,}])/);
        if (!match) throw new Error('Unsupported ICU argument');
        cursor += match[0].length;
        if (match[1] === '}') {
          output += token(message.slice(start, cursor), false);
          continue;
        }
        const type = message.slice(cursor).match(/^\s*(select|plural|selectordinal)\s*,/);
        if (!type) {
          const end = message.indexOf('}', cursor);
          if (end < 0) throw new Error('Unclosed ICU formatter');
          cursor = end + 1;
          output += token(message.slice(start, cursor), false);
          continue;
        }
        cursor += type[0].length;
        output += token(message.slice(start, cursor));
        while (cursor < message.length) {
          const selector = message.slice(cursor).match(/^\s*(?:=[\d.-]+|[\w-]+)\s*\{/);
          if (!selector) break;
          output += token(selector[0]);
          cursor += selector[0].length;
          output += content(true);
          if (message[cursor] !== '}') throw new Error('Unclosed ICU branch');
          output += token(message[cursor++]);
        }
        const end = message.slice(cursor).match(/^\s*\}/);
        if (!end) throw new Error('Unclosed ICU selector');
        output += token(end[0]);
        cursor += end[0].length;
      } else if (character === '<' && /^<\/?[\w-]+>/.test(message.slice(cursor))) {
        const tag = message.slice(cursor).match(/^<\/?[\w-]+>/)[0];
        output += token(tag);
        cursor += tag.length;
      } else if (character === "'" && /['{}#<>]/.test(message[cursor + 1] ?? '')) {
        const start = cursor++;
        if (message[cursor] === "'") cursor++;
        else {
          while (cursor < message.length) {
            if (message[cursor++] !== "'") continue;
            if (message[cursor] === "'") cursor++;
            else break;
          }
        }
        output += token(message.slice(start, cursor), false);
      } else {
        output += character === '#' ? token(character, false) : character;
        cursor++;
      }
    }
    return output;
  }
  // NMT can drop letters between adjacent identifiers; preserve each contiguous syntax span as one token.
  const source = content().replace(/(?:CTI18N\d+TOKEN){2,}/g, (span) => {
    const parts = span
      .match(/CTI18N\d+TOKEN/g)
      .map((name) => tokens.find((item) => item.name === name));
    return token(
      parts.map((item) => item.text).join(''),
      parts.some((item) => item.control),
    );
  });
  const activeTokens = (source.match(/CTI18N\d+TOKEN/g) ?? []).map((name) =>
    tokens.find((item) => item.name === name),
  );
  return {
    source,
    restore(translated) {
      if (typeof translated !== 'string' || !translated.trim())
        throw new Error('Empty translation');
      const names = translated.match(/CTI18N\d+TOKEN/g) ?? [];
      if (
        names.length !== activeTokens.length ||
        activeTokens.some(({ name }) => names.filter((item) => item === name).length !== 1)
      )
        throw new Error('Translation changed protected ICU tokens');
      const controls = new Set(
        activeTokens.filter((item) => item.control).map((item) => item.name),
      );
      if (
        JSON.stringify(names.filter((name) => controls.has(name))) !==
        JSON.stringify(activeTokens.filter((item) => item.control).map((item) => item.name))
      )
        throw new Error('Translation reordered ICU controls');
      const values = new Map(activeTokens.map(({ name, text }) => [name, text]));
      // New apostrophes/braces from the provider are text, never executable ICU syntax.
      const restored = translated
        .split(/(CTI18N\d+TOKEN)/)
        .map((part) => (values.has(part) ? values.get(part) : literalMessage(part)))
        .join('');
      assertSameMessageStructure(message, restored);
      return restored;
    },
  };
}
