import { describe, expect, test } from 'bun:test';
import {
  matchOutputFormat,
  outputFormatsOfParse,
  type RenderOutputFormatCandidate,
} from './render-output-format';

/**
 * Which contract format a rendered file is.
 *
 * Every file name and comp name below is copied from production: `media.ad_render_jobs.outputs`
 * for template 133 and `media.template_sources.parse` for the same template. The fleet returns
 * the files in a different order on every job, so position means nothing — only the name does.
 */

const comp = (name: string, width: number, height: number) => ({ name, width, height });

const TEMPLATE_133: RenderOutputFormatCandidate[] = [
  {
    id: 'landscape',
    ratio: '16:9',
    comp: comp('Producto individual con descuento 16:9', 1920, 1080),
    mediaType: 'JPG image (RGB)',
  },
  {
    id: 'square',
    ratio: '1:1',
    comp: comp('Producto individual con descuento 1:1', 1080, 1080),
    mediaType: 'JPG image (RGB)',
  },
  {
    id: 'story',
    ratio: '9:16',
    comp: comp('Producto individual con descuento 9:16', 1080, 1920),
    mediaType: 'JPG image (RGB)',
  },
];

const idsOf = (fileNames: string[], formats = TEMPLATE_133) =>
  fileNames.map((fileName) => matchOutputFormat(fileName, formats)?.id ?? null);

describe('the three real template-133 jobs, in the order the fleet returned them', () => {
  test('37589754 — 16:9, 1:1, 9:16', () => {
    expect(
      idsOf([
        'Producto_individual_con_descuento_16_9_9w5xxwa.jpg',
        'Producto_individual_con_descuento_1_1_1mjxxwb.jpg',
        'Producto_individual_con_descuento_9_16_ooqxxwb.jpg',
      ]),
    ).toEqual(['landscape', 'square', 'story']);
  });

  test('a4aa5f29 — 16:9, 9:16, 1:1', () => {
    expect(
      idsOf([
        'Producto_individual_con_descuento_16_9_1ilxxkt.jpg',
        'Producto_individual_con_descuento_9_16_wnoxxku.jpg',
        'Producto_individual_con_descuento_1_1_00nxxkv.jpg',
      ]),
    ).toEqual(['landscape', 'story', 'square']);
  });

  test('557c117b (failed) — 9:16 first', () => {
    expect(
      idsOf([
        'Producto_individual_con_descuento_9_16_iutp1e0.jpg',
        'Producto_individual_con_descuento_1_1_ipgp1e1.jpg',
        'Producto_individual_con_descuento_16_9_ygdp1e0.jpg',
      ]),
    ).toEqual(['story', 'square', 'landscape']);
  });
});

describe('the name rule', () => {
  test('runs of separators collapse, and case never matters', () => {
    const formats = [
      { id: 'feed', ratio: '4:5', comp: comp('Promo -- Feed 4:5', 1080, 1350) },
      { id: 'reel', ratio: '9:16', comp: comp('Promo -- Reel 9:16', 1080, 1920) },
    ];
    expect(matchOutputFormat('promo____FEED_4_5_x1y2z3.png', formats)?.id).toBe('feed');
    expect(matchOutputFormat('Promo_Reel_9_16_abc.jpg', formats)?.id).toBe('reel');
  });

  test('one comp rendered as a still and a video splits by the file kind', () => {
    const formats = [
      {
        id: 'still',
        ratio: '1:1',
        comp: comp('Hero 1:1', 1080, 1080),
        mediaType: 'JPG image (RGB)',
      },
      {
        id: 'motion',
        ratio: '1:1',
        comp: comp('Hero 1:1', 1080, 1080),
        mediaType: 'MP4 Video (RGB)',
      },
    ];
    expect(matchOutputFormat('Hero_1_1_q8w.jpg', formats)?.id).toBe('still');
    expect(matchOutputFormat('Hero_1_1_q8w.mp4', formats)?.id).toBe('motion');
    expect(matchOutputFormat('Hero_1_1_q8w.mov', formats)?.id).toBe('motion');
  });

  test('a format with no comp falls back to a unique trailing ratio token', () => {
    const formats = [
      { id: 'wide', ratio: '16:9', comp: null },
      { id: 'tall', ratio: '9:16' },
    ];
    expect(matchOutputFormat('Anything_at_all_16_9_k3j.jpg', formats)?.id).toBe('wide');
    expect(matchOutputFormat('Anything_at_all_9_16_k3j.jpg', formats)?.id).toBe('tall');
  });
});

describe('never a guess', () => {
  test('two formats that answer the same name and the same kind', () => {
    const formats = [
      { id: 'a', ratio: '1:1', comp: comp('Hero 1:1', 1080, 1080), mediaType: 'JPG image (RGB)' },
      { id: 'b', ratio: '1:1', comp: comp('Hero 1:1', 1080, 1080), mediaType: null },
    ];
    expect(matchOutputFormat('Hero_1_1_q8w.jpg', formats)).toBeNull();
  });

  test('a ratio token two formats share', () => {
    const formats = [
      { id: 'a', ratio: '1:1', comp: null },
      { id: 'b', ratio: '1:1', comp: null },
    ];
    expect(matchOutputFormat('Square_1_1_q8w.jpg', formats)).toBeNull();
  });

  test('a file nothing names', () => {
    expect(matchOutputFormat('render-1', TEMPLATE_133)).toBeNull();
    expect(matchOutputFormat('Other_template_4_5_zz1.jpg', TEMPLATE_133)).toBeNull();
    expect(matchOutputFormat('Producto_individual_con_descuento_9_16_ooqxxwb.jpg', [])).toBeNull();
  });
});

describe('the formats a parsed template delivers, when its contract publishes none', () => {
  // Template 133's forge surface answers `outputs: []`, so its parse is the only format source.
  const PARSE_133 = {
    comps: [
      { name: 'Producto individual con descuento 1:1', width: 1080, height: 1080 },
      { name: 'Producto individual con descuento 9:16', width: 1080, height: 1920 },
      { name: 'Producto individual con descuento 16:9', width: 1920, height: 1080 },
      { name: 'BG 1:1', width: 1080, height: 1080 },
    ],
    ratios: [
      { ratio: '1:1', width: 1080, height: 1080, comps: ['Producto individual con descuento 1:1'] },
      {
        ratio: '9:16',
        width: 1080,
        height: 1920,
        comps: ['Producto individual con descuento 9:16'],
      },
      {
        ratio: '16:9',
        width: 1920,
        height: 1080,
        comps: ['Producto individual con descuento 16:9'],
      },
    ],
  };

  test('one format per delivery comp, in the designer’s order, sized from the comp', () => {
    expect(outputFormatsOfParse(PARSE_133)).toEqual([
      {
        id: 'Producto individual con descuento 1:1',
        ratio: '1:1',
        comp: comp('Producto individual con descuento 1:1', 1080, 1080),
      },
      {
        id: 'Producto individual con descuento 9:16',
        ratio: '9:16',
        comp: comp('Producto individual con descuento 9:16', 1080, 1920),
      },
      {
        id: 'Producto individual con descuento 16:9',
        ratio: '16:9',
        comp: comp('Producto individual con descuento 16:9', 1920, 1080),
      },
    ]);
  });

  test('and every real file of job 37589754 resolves against them', () => {
    const formats = outputFormatsOfParse(PARSE_133);
    expect(
      idsOf(
        [
          'Producto_individual_con_descuento_16_9_9w5xxwa.jpg',
          'Producto_individual_con_descuento_1_1_1mjxxwb.jpg',
          'Producto_individual_con_descuento_9_16_ooqxxwb.jpg',
        ],
        formats,
      ),
    ).toEqual([
      'Producto individual con descuento 16:9',
      'Producto individual con descuento 1:1',
      'Producto individual con descuento 9:16',
    ]);
  });

  test('a size the contract would refuse is dropped, and no parse is no formats', () => {
    expect(
      outputFormatsOfParse({
        comps: [],
        ratios: [{ ratio: '1:1', width: 0, height: 1080, comps: ['X'] }],
      }),
    ).toEqual([]);
    expect(outputFormatsOfParse(null)).toEqual([]);
  });
});
