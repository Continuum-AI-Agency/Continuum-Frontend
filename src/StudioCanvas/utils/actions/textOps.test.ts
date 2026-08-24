import { describe, expect, it } from 'bun:test';
import { concatText, findReplace, splitText } from './textOps';

describe('findReplace', () => {
  it('swaps every occurrence, not just the first', () => {
    expect(
      findReplace('one fish two fish', { find: 'fish', replace: 'cat', caseSensitive: true }),
    ).toBe('one cat two cat');
  });

  it('leaves the input alone when the term is absent', () => {
    expect(findReplace('hello', { find: 'zzz', replace: 'x', caseSensitive: true })).toBe('hello');
  });

  it('honours case when caseSensitive is on', () => {
    expect(findReplace('Fish fish', { find: 'fish', replace: 'cat', caseSensitive: true })).toBe(
      'Fish cat',
    );
  });

  it('matches either case when caseSensitive is off', () => {
    expect(
      findReplace('Fish fish FISH', { find: 'fish', replace: 'cat', caseSensitive: false }),
    ).toBe('cat cat cat');
  });

  it('treats regex metacharacters in the search term literally', () => {
    expect(findReplace('abc a.c', { find: 'a.c', replace: 'X', caseSensitive: true })).toBe(
      'abc X',
    );
    expect(findReplace('abc a.c', { find: 'a.c', replace: 'X', caseSensitive: false })).toBe(
      'abc X',
    );
    expect(findReplace('cost is $5', { find: '$5', replace: '$6', caseSensitive: false })).toBe(
      'cost is $6',
    );
    expect(findReplace('a+b', { find: 'a+', replace: '', caseSensitive: false })).toBe('b');
  });

  it('is a no-op for an empty search term rather than exploding the string', () => {
    expect(findReplace('abc', { find: '', replace: '-', caseSensitive: true })).toBe('abc');
    expect(findReplace('abc', { find: '', replace: '-', caseSensitive: false })).toBe('abc');
  });

  it('inserts $-patterns in the replacement literally', () => {
    // String.replace would expand these into the matched text / capture groups.
    expect(findReplace('hello', { find: 'hello', replace: '$&', caseSensitive: true })).toBe('$&');
    expect(findReplace('hello', { find: 'hello', replace: '$&', caseSensitive: false })).toBe('$&');
    expect(findReplace('hello', { find: 'hello', replace: '$1 $`', caseSensitive: false })).toBe(
      '$1 $`',
    );
  });

  it('handles a multi-line body without special-casing newlines', () => {
    expect(findReplace('a\nb\na', { find: 'a', replace: 'z', caseSensitive: true })).toBe(
      'z\nb\nz',
    );
  });
});

describe('findReplace — regex and whole-word', () => {
  it('is byte-identical to the literal path when the new fields are absent', () => {
    expect(
      findReplace('a.c abc', { find: 'a.c', replace: 'X', caseSensitive: true, regex: false }),
    ).toBe('X abc');
    expect(
      findReplace('hello', {
        find: 'hello',
        replace: '$&',
        caseSensitive: true,
        wholeWord: false,
      }),
    ).toBe('$&');
  });

  it('expands capture groups in regex mode — the reason regex mode exists', () => {
    expect(
      findReplace('John Smith', {
        find: '(\\w+) (\\w+)',
        replace: '$2, $1',
        caseSensitive: true,
        regex: true,
      }),
    ).toBe('Smith, John');
  });

  it('keeps $-patterns literal in literal mode even with wholeWord on', () => {
    expect(
      findReplace('cat cats', {
        find: 'cat',
        replace: '$&!',
        caseSensitive: true,
        wholeWord: true,
      }),
    ).toBe('$&! cats');
  });

  it('returns the input unchanged for an invalid regex rather than throwing', () => {
    expect(findReplace('a(b', { find: '(', replace: 'X', caseSensitive: true, regex: true })).toBe(
      'a(b',
    );
    expect(
      findReplace('a(b', {
        find: '(',
        replace: 'X',
        caseSensitive: false,
        regex: true,
        wholeWord: true,
      }),
    ).toBe('a(b');
  });

  it('still refuses an empty search term in regex mode', () => {
    expect(findReplace('abc', { find: '', replace: '-', caseSensitive: true, regex: true })).toBe(
      'abc',
    );
  });

  it('does not match inside a longer word when wholeWord is on', () => {
    expect(
      findReplace('cat cats catalog', {
        find: 'cat',
        replace: 'dog',
        caseSensitive: true,
        wholeWord: true,
      }),
    ).toBe('dog cats catalog');
    expect(
      findReplace('Cat cats', {
        find: 'cat',
        replace: 'dog',
        caseSensitive: false,
        wholeWord: true,
      }),
    ).toBe('dog cats');
  });

  it('composes regex with wholeWord, anchoring every alternation branch', () => {
    expect(
      findReplace('cat catalog dog dogma', {
        find: 'cat|dog',
        replace: 'X',
        caseSensitive: true,
        regex: true,
        wholeWord: true,
      }),
    ).toBe('X catalog X dogma');
  });
});

describe('splitText', () => {
  it('splits on newlines, treating CRLF and a lone CR as one break', () => {
    expect(splitText('a\nb\nc', { mode: 'newline' })).toEqual(['a', 'b', 'c']);
    const mixed = splitText('a\r\nb\rc\nd', { mode: 'newline' });
    expect(mixed).toEqual(['a', 'b', 'c', 'd']);
    expect(mixed.some((part) => part.includes('\r'))).toBe(false);
  });

  it('passes quoted strings through untouched — this is not a CSV parser', () => {
    expect(splitText('say "hello, there"', { mode: 'newline' })).toEqual(['say "hello, there"']);
    // Quotes are preserved verbatim, and a quoted comma still splits.
    expect(splitText('"a","b, still b"', { mode: 'comma' })).toEqual(['"a"', '"b', 'still b"']);
  });

  it('returns a single empty part for empty input', () => {
    expect(splitText('', { mode: 'newline' })).toEqual(['']);
    expect(splitText('', { mode: 'charCount', size: 3 })).toEqual(['']);
    expect(splitText('   ', { mode: 'comma' })).toEqual(['']);
  });

  it('treats a custom separator literally and refuses an empty one', () => {
    expect(splitText('a||b||c', { mode: 'custom', separator: '||' })).toEqual(['a', 'b', 'c']);
    expect(splitText('a.b axb', { mode: 'custom', separator: '.' })).toEqual(['a', 'b axb']);
    expect(splitText('abc', { mode: 'custom', separator: '' })).toEqual(['abc']);
    expect(splitText('abc', { mode: 'custom' })).toEqual(['abc']);
  });

  it('compiles regex mode, and degrades to the whole input on a bad pattern', () => {
    expect(splitText('a1b22c', { mode: 'regex', separator: '\\d+' })).toEqual(['a', 'b', 'c']);
    expect(splitText('a(b', { mode: 'regex', separator: '(' })).toEqual(['a(b']);
    expect(splitText('abc', { mode: 'regex' })).toEqual(['abc']);
  });

  it('splits paragraphs on runs of two or more newlines', () => {
    expect(splitText('p one\nstill one\n\np two\n\n\np three', { mode: 'paragraph' })).toEqual([
      'p one\nstill one',
      'p two',
      'p three',
    ]);
  });

  it('groups lines into chunks of size for lineCount', () => {
    expect(splitText('l1\nl2\nl3\nl4\nl5', { mode: 'lineCount', size: 2 })).toEqual([
      'l1\nl2',
      'l3\nl4',
      'l5',
    ]);
    expect(splitText('l1\nl2', { mode: 'lineCount' })).toEqual(['l1', 'l2']);
  });

  it('keeps blank fixed-width chunks even when skipEmpty is on', () => {
    // A blank chunk's index is its meaning; dropping it renumbers everything after.
    expect(splitText('a\n\n\nb', { mode: 'lineCount', size: 1, skipEmpty: true })).toEqual([
      'a',
      '',
      '',
      'b',
    ]);
  });

  it('chunks charCount over code points, never mid-surrogate-pair', () => {
    expect(splitText('abcde', { mode: 'charCount', size: 2 })).toEqual(['ab', 'cd', 'e']);
    expect(splitText('ab', { mode: 'charCount' })).toEqual(['a', 'b']);
    expect(splitText('👍👍', { mode: 'charCount', size: 1 })).toEqual(['👍', '👍']);
    expect(splitText('a👍b', { mode: 'charCount', size: 2 })).toEqual(['a👍', 'b']);
  });

  it('clamps a nonsense chunk size to 1 instead of looping forever', () => {
    expect(splitText('abc', { mode: 'charCount', size: 0 })).toEqual(['a', 'b', 'c']);
    expect(splitText('abc', { mode: 'charCount', size: -3 })).toEqual(['a', 'b', 'c']);
  });

  it('folds the remainder into the last part rather than dropping it', () => {
    expect(splitText('a,b,c,d', { mode: 'comma', maxParts: 2 })).toEqual(['a', 'b,c,d']);
    expect(splitText('a||b||c', { mode: 'custom', separator: '||', maxParts: 2 })).toEqual([
      'a',
      'b||c',
    ]);
    // The ORIGINAL separators come back, not a canonical stand-in.
    expect(splitText('a1b22c', { mode: 'regex', separator: '\\d+', maxParts: 2 })).toEqual([
      'a',
      'b22c',
    ]);
    expect(splitText('abcde', { mode: 'charCount', size: 1, maxParts: 2 })).toEqual(['a', 'bcde']);
    expect(splitText('l1\nl2\nl3\nl4', { mode: 'lineCount', size: 1, maxParts: 2 })).toEqual([
      'l1',
      'l2\nl3\nl4',
    ]);
  });

  it('ignores a maxParts that cannot cap anything', () => {
    expect(splitText('a,b,c', { mode: 'comma', maxParts: null })).toEqual(['a', 'b', 'c']);
    expect(splitText('a,b,c', { mode: 'comma', maxParts: 0 })).toEqual(['a', 'b', 'c']);
    expect(splitText('a,b,c', { mode: 'comma', maxParts: 9 })).toEqual(['a', 'b', 'c']);
    expect(splitText('a,b,c', { mode: 'comma', maxParts: 1 })).toEqual(['a,b,c']);
  });

  it('trims and drops empties by default, and stops doing both on request', () => {
    expect(splitText('a , b', { mode: 'comma' })).toEqual(['a', 'b']);
    expect(splitText('a , b', { mode: 'comma', trim: false })).toEqual(['a ', ' b']);
    expect(splitText('a,,b', { mode: 'comma' })).toEqual(['a', 'b']);
    expect(splitText('a,,b', { mode: 'comma', skipEmpty: false })).toEqual(['a', '', 'b']);
  });
});

describe('concatText', () => {
  it('joins with a newline by default', () => {
    expect(concatText(['a', 'b'], {})).toBe('a\nb');
    expect(concatText(['a', 'b'], { separator: ' | ' })).toBe('a | b');
  });

  it('wraps the WHOLE result with prefix/suffix, not each part', () => {
    expect(concatText(['a', 'b'], { prefix: '[', suffix: ']', separator: ',' })).toBe('[a,b]');
  });

  it('leaves whitespace alone unless trim is asked for', () => {
    expect(concatText([' a ', 'b'], {})).toBe(' a \nb');
    expect(concatText([' a ', ' b '], { trim: true })).toBe('a\nb');
  });

  it('drops empty parts by default, keeps them on request', () => {
    expect(concatText(['a', '', 'b'], {})).toBe('a\nb');
    expect(concatText(['a', '', 'b'], { skipEmpty: false })).toBe('a\n\nb');
    expect(concatText(['a', '   ', 'b'], { trim: true })).toBe('a\nb');
    expect(concatText(['a', '   ', 'b'], {})).toBe('a\n   \nb');
  });

  it('still emits the wrapper for an empty list', () => {
    expect(concatText([], {})).toBe('');
    expect(concatText([], { prefix: '<', suffix: '>' })).toBe('<>');
  });

  it('round-trips a newline split without touching quoted text', () => {
    const source = 'say "hi, there"\nand again';
    expect(concatText(splitText(source, { mode: 'newline' }), {})).toBe(source);
  });
});
