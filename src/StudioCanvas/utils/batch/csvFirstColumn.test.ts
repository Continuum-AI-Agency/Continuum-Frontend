import { describe, expect, it } from 'bun:test';

import { csvFirstColumn } from './csvFirstColumn';

describe('csvFirstColumn', () => {
  it('reads cell 1 of every row and ignores the rest', () => {
    expect(csvFirstColumn('a,b,c\nd,e,f').values).toEqual(['a', 'd']);
  });

  it('treats CRLF as one row break, not two', () => {
    // Splitting on \r and \n separately pushes a blank row between every real one.
    expect(csvFirstColumn('one,x\r\ntwo,y\r\nthree,z').values).toEqual(['one', 'two', 'three']);
  });

  it('keeps a comma that lives inside a quoted cell', () => {
    // The whole reason this is not `split(',')`.
    expect(csvFirstColumn('"Bold, fast, yours",tagline\nplain,x').values).toEqual([
      'Bold, fast, yours',
      'plain',
    ]);
  });

  it('keeps a newline that lives inside a quoted cell', () => {
    expect(csvFirstColumn('"line one\nline two",x\nnext,y').values).toEqual([
      'line one\nline two',
      'next',
    ]);
  });

  it('unescapes a doubled quote inside a quoted cell', () => {
    expect(csvFirstColumn('"She said ""go""",x').values).toEqual(['She said "go"']);
  });

  it('trims an unquoted cell but keeps a quoted one verbatim', () => {
    expect(csvFirstColumn('  padded  ,x\n"  kept  ",y').values).toEqual(['padded', '  kept  ']);
  });

  it('skips blank lines and empty first cells', () => {
    expect(csvFirstColumn('a,1\n\n,2\nb,3\n').values).toEqual(['a', 'b']);
  });

  it('reads the last row when the file has no trailing newline', () => {
    expect(csvFirstColumn('only').values).toEqual(['only']);
  });

  it('reports truncation instead of silently cutting', () => {
    const rows = Array.from({ length: 105 }, (_, index) => `row-${index}`).join('\n');
    const result = csvFirstColumn(rows);
    expect(result.values).toHaveLength(100);
    expect(result.truncated).toBe(true);
    expect(result.values[99]).toBe('row-99');
  });

  it('does not report truncation at exactly the cap', () => {
    const rows = Array.from({ length: 100 }, (_, index) => `row-${index}`).join('\n');
    expect(csvFirstColumn(rows).truncated).toBe(false);
  });

  it('returns nothing for an empty paste', () => {
    expect(csvFirstColumn('').values).toEqual([]);
    expect(csvFirstColumn('\n\n\n').values).toEqual([]);
  });
});
