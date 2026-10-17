import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import {
  colourOf,
  decodeDelimitedBytes,
  detectHeaderRow,
  fillLabel,
  matchAssetByName,
  parseDelimited,
  pickSheet,
  prepareImport,
  readWorkbook,
  sheetTable,
  withDecimals,
} from './forge-sheet-import';

// The owner's own Fecha 10 workbook and the CSV Google Sheets exported from its first tab.
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/caliente/${name}`, import.meta.url)));
const workbook = readWorkbook(fixture('cuotas-fecha-10.xlsx'));
const sheet = (name: string) => workbook.find((entry) => entry.name.trim() === name)!;

const CARD_A_TEMPLATE = {
  templateName: 'Card A (Pre-Match) — Jerseys',
  variables: [
    'Bet Amount',
    'Draw Bet',
    'Left Jersey',
    'Left Team',
    'Left Team Bet',
    'Left Team Box Color',
    'Left Team Text Color',
    'QR Code',
    'Right Jersey',
    'Right Team',
    'Right Team Bet',
    'Right Team Box Color',
    'Right Team Text Color',
    'Win Amount',
  ].map((label) => ({ key: label.toLowerCase().replace(/\s+/g, '_'), label })),
};
const CARD_B_TEMPLATE = {
  templateName: 'Caliente Card B Halftime',
  variables: [
    ['template_field_1', 'Right Odds (Menos de 2.5 / No)'],
    ['template_field_2', 'Left Odds (Más de 2.5 / Si)'],
    ['template_field_3', 'Right Box Color'],
    ['template_field_4', 'Left Box Color'],
    ['template_field_5', 'Left Text Color'],
    ['template_field_6', 'Right Text Color'],
    ['template_field_7', 'Match'],
    ['template_field_8', 'Bet Amount'],
    ['template_field_9', 'Win Amount'],
    ['template_field_10', 'QR Code'],
  ].map(([key, label]) => ({ key: key!, label: label! })),
};

describe('readWorkbook', () => {
  test('reads every sheet in tab order, names as typed', () => {
    expect(workbook.map((entry) => entry.name)).toEqual(['Hoja1', 'Card A ', 'Card B ']);
  });

  test('a formula is its cached value, shared formulas included', () => {
    const cardA = sheet('Card A').cells;
    expect(cardA[2]?.[11]).toBe('162'); // =K3*C3
    expect(cardA[3]?.[11]).toBe('127'); // shared formula, no text of its own
    expect(sheet('Card B').cells[3]?.[0]).toBe('Alianza Atletico vs Comerciantes Unidos ');
  });

  test('numbers as stored, rich text joined, line breaks kept', () => {
    const cardA = sheet('Card A').cells;
    expect(cardA[2]?.[5]).toBe('5.3');
    expect(cardA[3]?.[5]).toBe('11');
    expect(sheet('Hoja1').cells[22]?.[2]).toBe('Si:   1.75\nNo:   1.90');
  });

  test('a file that is not a workbook is refused by name', () => {
    expect(() => readWorkbook(strToU8('Partido,Mercado'))).toThrow('render_import_failed');
    expect(() => readWorkbook(zipSync({ 'a.txt': strToU8('x') }))).toThrow('render_import_failed');
  });
});

describe('sheetTable', () => {
  test('Card A: header under the notes row, data stops before the colour legend', () => {
    const table = sheetTable(sheet('Card A').cells);
    expect(table.headerRow).toBe(1);
    expect(table.headers).toEqual([
      'Equipo A',
      'Equipo B',
      'Cuota A',
      'Color Cuota A',
      'Color Texto A',
      'Cuota B',
      'Color Cuota B',
      'Color Texto B',
      'Cuota Empate',
      'Color Cuota Empate',
      'Si Apuestas',
      'Ganarias',
      'Kit Equipo A',
      'Kit Equipo B',
    ]);
    expect(table.rows).toHaveLength(9);
    expect(table.rows[8]?.['Equipo A']).toBe('ADT');
    expect(table.legend).toEqual({ rojo: '#d72828', blanco: '#ffffff', negro: '#000000' });
    expect(table.notes).toContain('*Quedo excluido Chankas');
    expect(table.notes.join('\n')).toContain('*las cuotas siempre llevan 2 decimales');
  });

  test('Card B: header on the third row, the CONCATENATE cell is the match', () => {
    const table = sheetTable(sheet('Card B').cells);
    expect(table.headerRow).toBe(2);
    expect(table.rows).toHaveLength(9);
    expect(table.rows[0]?.Partido).toBe('Alianza Atletico vs Comerciantes Unidos');
    expect(table.rows[0]?.Mercado).toBe('Ambos equipos anotan');
  });

  test('Hoja1 reads the same from the xlsx and from its CSV export', () => {
    const fromXlsx = sheetTable(sheet('Hoja1').cells);
    const csv = parseDelimited(decodeDelimitedBytes(fixture('cuotas-fecha-10-hoja1.csv')), {
      keepBlankRows: true,
    });
    const fromCsv = sheetTable(csv);
    expect(fromXlsx.headerRow).toBe(21);
    expect(fromCsv.headerRow).toBe(21);
    expect(fromCsv.headers).toEqual(['Partido', 'Mercado', 'Cuotas']);
    expect(fromCsv.rows).toEqual(fromXlsx.rows);
    expect(fromCsv.rows).toHaveLength(9);
    expect(fromCsv.notes).toContain('*PENDIENTE');
  });

  test('blank header cells over data get a name; a repeated header gets a suffix', () => {
    const table = sheetTable([
      ['Team', '', 'Team'],
      ['A', 'x', 'B'],
    ]);
    expect(table.headers).toEqual(['Team', 'Column 2', 'Team (2)']);
  });

  test('a sheet whose first row is its header still reads from row one', () => {
    expect(
      detectHeaderRow([
        ['Name', 'Price'],
        ['Hat', '9.99'],
      ]),
    ).toBe(0);
  });
});

describe('pickSheet', () => {
  const tables = workbook.map((entry) => ({ name: entry.name, table: sheetTable(entry.cells) }));

  test('each card reads its own sheet', () => {
    expect(tables[pickSheet(tables, CARD_A_TEMPLATE)]?.name).toBe('Card A ');
    expect(tables[pickSheet(tables, CARD_B_TEMPLATE)]?.name).toBe('Card B ');
  });

  test('a saved mapping recognises its sheet over the name', () => {
    const saved = { ...CARD_A_TEMPLATE, savedHeaders: ['Partido', 'Mercado', 'Cuotas'] };
    expect(tables[pickSheet(tables, saved)]?.name).toBe('Hoja1');
  });
});

describe('values', () => {
  test('colours from the sheet legend, then names, then hex in any case or length', () => {
    const legend = { rojo: '#d72828' };
    expect(colourOf('Rojo', legend)).toBe('#d72828');
    expect(colourOf('Blanco')).toBe('#ffffff');
    expect(colourOf('#ffffff ')).toBe('#ffffff');
    expect(colourOf('D72828')).toBe('#d72828');
    expect(colourOf('#FFF')).toBe('#ffffff');
    expect(colourOf('colo caja menos')).toBeNull();
  });

  test('odds keep two places, decimal comma included; text is untouched', () => {
    expect(withDecimals('1.4', 2)).toBe('1.40');
    expect(withDecimals('11', 2)).toBe('11.00');
    expect(withDecimals('1,85', 2)).toBe('1.85');
    expect(withDecimals('Si', 2)).toBe('Si');
  });

  test('labels fill from headers, spacing and case forgiven', () => {
    expect(
      fillLabel('{Equipo A} vs. {equipo b}', { 'Equipo A': 'ADT ', 'Equipo B': 'Cienciano' }),
    ).toBe('ADT vs. Cienciano');
  });

  test('Card B through a mapping: outputs by market, odds at two places, colours as hex', () => {
    const table = sheetTable(sheet('Card B').cells);
    const prepared = prepareImport(
      table,
      {
        columns: {
          Partido: 'template_field_7',
          Mercado: '@formats',
          'Cuota A': 'template_field_2',
          'Color Cuota A': 'template_field_4',
          'Color Texto A': 'template_field_5',
          'Cuota B': 'template_field_1',
          'Color Cuota B': 'template_field_3',
          'Color Texto B': 'template_field_6',
          'Si Apuestas': 'template_field_8',
          Ganarias: 'template_field_9',
        },
        label: '{Partido}',
        outputs: { 'ambos equipos anotan': 'btts', 'mas menos 2 5 goles': 'halftime' },
        decimals: { template_field_1: 2, template_field_2: 2 },
      },
      CARD_B_TEMPLATE.variables.map((variable) => ({ ...variable, kind: 'text' })),
    );
    expect(prepared.columns['Row name']).toBe('@name');
    const first = prepared.rows[0]!;
    expect(first['Row name']).toBe('Alianza Atletico vs Comerciantes Unidos');
    expect(first.Mercado).toBe('btts');
    expect(first['Cuota B']).toBe('1.90');
    expect(first['Color Cuota A']).toBe('#ffffff');
    expect(first['Color Cuota B']).toBe('#d72828');
    expect(first.Ganarias).toBe('190');
    expect(prepared.rows[1]?.Mercado).toBe('halftime');
    expect(prepared.rows[8]?.['Cuota B']).toBe('2.00');
  });
});

describe('matchAssetByName', () => {
  const files = [
    { name: 'melgar.png' },
    { name: 'Universitario de Deportes.png' },
    { name: 'Sporting Cristal.jpg' },
    { name: 'utc cajamarca.png' },
    { name: 'alianza lima.png' },
    { name: 'alianza atletico.png' },
  ];

  test('accents, clubs, extensions and spacing do not matter', () => {
    expect(matchAssetByName('FBC Melgar ', files)?.name).toBe('melgar.png');
    expect(matchAssetByName('Sporting Cristal', files)?.name).toBe('Sporting Cristal.jpg');
    expect(matchAssetByName('Alianza Atlético', files)?.name).toBe('alianza atletico.png');
    expect(matchAssetByName('Universitario', files)?.name).toBe('Universitario de Deportes.png');
  });

  test('no match, or a name two files could mean, is null', () => {
    expect(matchAssetByName('Cienciano', files)).toBeNull();
    expect(matchAssetByName('Alianza', files)).toBeNull();
    expect(matchAssetByName('UTC', files)).toBeNull();
  });
});
