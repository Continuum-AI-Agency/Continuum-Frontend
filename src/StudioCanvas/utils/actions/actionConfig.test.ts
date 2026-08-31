import { describe, expect, it } from 'bun:test';
import { ACTION_DEFS, ACTION_IDS } from '@continuum/contracts';
import {
  type ConfigField,
  configFieldsFor,
  humaniseConfigKey,
  type NumberConfigField,
  numericControlFor,
  parseActionConfig,
  unsupportedConfigKeys,
} from './actionConfig';

const fieldsByKey = (id: (typeof ACTION_IDS)[number]): Map<string, ConfigField> =>
  new Map(configFieldsFor(id).map((field) => [field.key, field]));

describe('configFieldsFor across the whole registry', () => {
  it('describes every op without throwing', () => {
    for (const id of ACTION_IDS) {
      expect(() => configFieldsFor(id)).not.toThrow();
    }
  });

  it('leaves no config key unrendered — the drift guard', () => {
    // A new op with a config type this module cannot introspect fails HERE, by name,
    // rather than shipping a popover that is quietly missing a control.
    const orphans = ACTION_IDS.flatMap((id) =>
      unsupportedConfigKeys(id).map((key) => `${id}.${key}`),
    );
    expect(orphans).toEqual([]);
  });

  it('covers exactly the keys the schema declares', () => {
    for (const id of ACTION_IDS) {
      const defaults = ACTION_DEFS[id].config.parse({}) as Record<string, unknown>;
      expect(configFieldsFor(id).map((field) => field.key)).toEqual(Object.keys(defaults));
    }
  });

  it('reports the value the schema itself would produce as each default', () => {
    for (const id of ACTION_IDS) {
      const defaults = ACTION_DEFS[id].config.parse({}) as Record<string, unknown>;
      for (const field of configFieldsFor(id)) {
        expect(field.defaultValue).toEqual(defaults[field.key] as never);
      }
    }
  });

  it('gives every enum a non-empty option list containing its default', () => {
    for (const id of ACTION_IDS) {
      for (const field of configFieldsFor(id)) {
        if (field.kind !== 'enum') continue;
        expect(field.options.length).toBeGreaterThan(0);
        if (field.defaultValue !== null) expect(field.options).toContain(field.defaultValue);
      }
    }
  });

  it('keeps a number default inside the bounds it reports', () => {
    for (const id of ACTION_IDS) {
      for (const field of configFieldsFor(id)) {
        if (field.kind !== 'number' || field.defaultValue === null) continue;
        if (field.min !== undefined) expect(field.defaultValue).toBeGreaterThanOrEqual(field.min);
        if (field.max !== undefined) expect(field.defaultValue).toBeLessThanOrEqual(field.max);
      }
    }
  });
});

describe('configFieldsFor per op', () => {
  it('reads image.rotate as a bounded angle plus expand and background', () => {
    const fields = configFieldsFor('image.rotate');
    expect(fields.map((field) => [field.key, field.kind])).toEqual([
      ['degrees', 'number'],
      ['expand', 'boolean'],
      ['background', 'color'],
    ]);
    expect(fields[0]).toEqual({
      key: 'degrees',
      label: 'Degrees',
      kind: 'number',
      min: -360,
      max: 360,
      step: 1,
      nullable: false,
      defaultValue: 90,
    });
    expect(fields[2]?.nullable).toBe(true);
    expect(fields[2]?.defaultValue).toBeNull();
  });

  it('reads a #rrggbb schema field as a colour, not a string', () => {
    // The whole point of the kind: `image.chromaKey` has TWO colours and a plain enum, and
    // neither colour may come back as something you have to type a hex into.
    expect(configFieldsFor('image.chromaKey').map((field) => [field.key, field.kind])).toEqual([
      ['mode', 'enum'],
      ['color', 'color'],
      ['replacement', 'color'],
      ['tolerance', 'number'],
      ['softness', 'number'],
    ]);
  });

  it('reads the colour off the DECLARATION, so a null default is still a colour', () => {
    // `image.rotate.background` is `.nullable().default(null)`. Recognising colours by
    // "the default looks like a hex" would hand this one op a text box while its eight
    // siblings got a picker — the exact drift the generic renderer exists to prevent.
    const background = configFieldsFor('image.rotate').find((field) => field.key === 'background');
    expect(background).toEqual({
      key: 'background',
      label: 'Background',
      kind: 'color',
      nullable: true,
      defaultValue: null,
    });
  });

  it('leaves a string with no hex pattern alone', () => {
    // `image.pad.aspectRatio` is also a regex-checked string — a `1:1` ratio, not a colour.
    // A probe that fired on "has a regex" rather than "has THE hex regex" would swallow it.
    const fields = configFieldsFor('image.pad');
    expect(fields.find((field) => field.key === 'aspectRatio')?.kind).toBe('string');
    expect(fields.find((field) => field.key === 'background')?.kind).toBe('color');
  });

  it('finds every colour in the registry and nothing else', () => {
    // A PROPERTY over the whole registry, not a frozen list of field names: the way this
    // regresses is an op added later whose colour quietly renders as a text box, and a list
    // someone has to remember to extend would go green on exactly that. Note `image.text`
    // is in scope here even though `BurnInConfig` draws its own ink row — which panel
    // renders a field is a rendering choice, not a reason for the vocabulary to lie.
    //
    // The oracle is INDEPENDENT of the zod introspection under test: it asks each schema
    // what it ACCEPTS. A field that takes `#00ff00` and refuses both a short hex and a word
    // is a colour, whatever the check list looks like internally.
    const acceptsHexOnly = (schema: unknown): boolean => {
      const parser = schema as { safeParse?: (value: unknown) => { success: boolean } };
      if (typeof parser.safeParse !== 'function') return false;
      return (
        parser.safeParse('#00ff00').success &&
        !parser.safeParse('#00ff0').success &&
        !parser.safeParse('not a colour').success
      );
    };

    for (const id of ACTION_IDS) {
      const shape = (ACTION_DEFS[id].config as unknown as { shape?: Record<string, unknown> })
        .shape;
      if (!shape) continue;
      const declared = Object.keys(shape).filter((key) => acceptsHexOnly(shape[key]));
      const rendered = configFieldsFor(id)
        .filter((field) => field.kind === 'color')
        .map((field) => field.key);
      expect({ id, colours: rendered }).toEqual({ id, colours: declared });
    }
  });

  it('reads text.findReplace as two strings and three booleans', () => {
    const fields = configFieldsFor('text.findReplace');
    expect(fields.map((field) => [field.key, field.kind])).toEqual([
      ['find', 'string'],
      ['replace', 'string'],
      ['caseSensitive', 'boolean'],
      ['regex', 'boolean'],
      ['wholeWord', 'boolean'],
    ]);
    expect(fields[2]?.label).toBe('Case Sensitive');
    expect(fields[2]?.defaultValue).toBe(false);
  });

  it('reads the video.subtitles preset as an enum of its six looks', () => {
    const preset = fieldsByKey('video.subtitles').get('preset');
    expect(preset?.kind).toBe('enum');
    expect(preset?.kind === 'enum' && preset.options).toEqual([
      'pop',
      'pulse',
      'glide',
      'fusion',
      'classic',
      'boxed',
    ]);
    expect(preset?.defaultValue).toBe('pop');
  });

  it('keeps a nullable default null rather than inventing a zero', () => {
    // `startSec: null` means "no window", which is not the same instruction as 0.
    const startSec = fieldsByKey('video.overlay').get('startSec');
    expect(startSec?.kind).toBe('number');
    expect(startSec?.nullable).toBe(true);
    expect(startSec?.defaultValue).toBeNull();
    expect(fieldsByKey('video.subtitles').get('language')?.defaultValue).toBeNull();
  });

  it('steps whole units on a wide integer range and finely on a narrow one', () => {
    const stepOf = (id: (typeof ACTION_IDS)[number], key: string) => {
      const field = fieldsByKey(id).get(key);
      return field?.kind === 'number' ? field.step : undefined;
    };
    expect(stepOf('image.blur', 'radiusPx')).toBe(1); // 0…200
    expect(stepOf('video.frameGrid', 'columns')).toBe(1); // 1…8
    expect(stepOf('image.grade', 'brightness')).toBe(0.05); // 0…3
    expect(stepOf('video.speed', 'rate')).toBe(0.05); // 0.1…8, fractional bound
  });

  it('has nothing to render for an op with no options', () => {
    expect(configFieldsFor('video.reverse')).toEqual([]);
    expect(unsupportedConfigKeys('video.reverse')).toEqual([]);
  });
});

describe('parseActionConfig', () => {
  it('keeps a valid stored override and fills the rest from the schema', () => {
    expect(parseActionConfig('image.rotate', { degrees: 45 })).toEqual({
      degrees: 45,
      expand: true,
      background: null,
    });
    expect(parseActionConfig('video.subtitles', { emphasize: false })).toEqual({
      preset: 'pop',
      emphasize: false,
      language: null,
    });
  });

  const ROTATE_DEFAULTS = { degrees: 90, expand: true, background: null };

  it('falls back to defaults rather than throwing on a value that no longer validates', () => {
    expect(parseActionConfig('image.rotate', { degrees: 9000 })).toEqual(ROTATE_DEFAULTS);
    expect(parseActionConfig('image.rotate', { degrees: 'sideways' })).toEqual(ROTATE_DEFAULTS);
  });

  it('treats a missing or non-object stored config as untouched defaults', () => {
    for (const raw of [undefined, null, 'garbage', 42, []]) {
      expect(parseActionConfig('image.rotate', raw)).toEqual(ROTATE_DEFAULTS);
    }
  });

  it('drops keys the schema does not declare', () => {
    expect(parseActionConfig('image.rotate', { degrees: 45, leftover: true })).toEqual({
      ...ROTATE_DEFAULTS,
      degrees: 45,
    });
  });

  it('returns something the schema accepts for every op, from nothing at all', () => {
    for (const id of ACTION_IDS) {
      expect(() => ACTION_DEFS[id].config.parse(parseActionConfig(id, undefined))).not.toThrow();
    }
  });
});

describe('humaniseConfigKey', () => {
  it('splits camelCase into words', () => {
    expect(humaniseConfigKey('caseSensitive')).toBe('Case Sensitive');
    expect(humaniseConfigKey('aspectRatio')).toBe('Aspect Ratio');
    expect(humaniseConfigKey('degrees')).toBe('Degrees');
  });

  it('spells out the registry abbreviations', () => {
    expect(humaniseConfigKey('radiusPx')).toBe('Radius Pixels');
    expect(humaniseConfigKey('startSec')).toBe('Start Seconds');
    expect(humaniseConfigKey('marginFrac')).toBe('Margin Fraction');
  });

  it('leaves an unknown trailing token alone', () => {
    expect(humaniseConfigKey('sampleFps')).toBe('Sample Fps');
  });
});

describe('numericControlFor', () => {
  const numericFields = (): Array<{ id: string; field: NumberConfigField }> =>
    ACTION_IDS.flatMap((id) =>
      configFieldsFor(id)
        .filter((field): field is NumberConfigField => field.kind === 'number')
        .map((field) => ({ id, field })),
    );

  it('routes every numeric field in the registry to one of the two controls', () => {
    // Neither branch may be empty: an all-slider verdict would mean the unbounded
    // fields are being drawn on a track with an invented right-hand end, and an
    // all-scrub verdict would mean the rule is off and nothing gained a slider.
    const verdicts = numericFields().map(({ field }) => numericControlFor(field));
    expect(verdicts.length).toBeGreaterThan(0);
    expect(verdicts.filter((v) => v === 'slider').length).toBeGreaterThan(0);
    expect(verdicts.filter((v) => v === 'scrub').length).toBeGreaterThan(0);
  });

  it('gives a slider only to a field a drag can actually aim', () => {
    for (const { id, field } of numericFields()) {
      if (numericControlFor(field) !== 'slider') continue;
      const where = `${id}.${field.key}`;
      expect(`${where}:${field.nullable}`).toBe(`${where}:false`);
      expect(typeof field.min).toBe('number');
      expect(typeof field.max).toBe('number');
      // Fewer stops than a track has pixels, so every value is reachable by drag.
      expect((field.max as number) - (field.min as number)).toBeLessThanOrEqual(1000 * field.step);
    }
  });

  it('sends the shapes a track cannot express to the scrub field', () => {
    const verdict = (id: (typeof ACTION_IDS)[number], key: string) => {
      const field = configFieldsFor(id).find((entry) => entry.key === key);
      if (!field || field.kind !== 'number') throw new Error(`${id}.${key} is not a number field`);
      return numericControlFor(field);
    };

    // Unbounded: a clip's length is not in the schema, so there is no right-hand end.
    expect(verdict('video.overlay', 'startSec')).toBe('scrub');
    expect(verdict('video.overlay', 'endSec')).toBe('scrub');
    // Nullable: null means "no cap", which is not a position on a track.
    expect(verdict('text.split', 'maxParts')).toBe('scrub');
    // Bounded but 10_000 stops wide — a number box wearing a slider.
    expect(verdict('text.split', 'size')).toBe('scrub');
  });

  it('gives the bounded knobs a track', () => {
    const verdict = (id: (typeof ACTION_IDS)[number], key: string) => {
      const field = configFieldsFor(id).find((entry) => entry.key === key);
      if (!field || field.kind !== 'number') throw new Error(`${id}.${key} is not a number field`);
      return numericControlFor(field);
    };

    expect(verdict('image.rotate', 'degrees')).toBe('slider');
    expect(verdict('video.overlay', 'opacity')).toBe('slider');
    expect(verdict('video.overlay', 'scale')).toBe('slider');
  });
});
