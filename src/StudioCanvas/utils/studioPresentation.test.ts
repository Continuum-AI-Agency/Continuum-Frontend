import { describe, expect, it } from 'bun:test';
import { ACTION_DEFS, ACTION_IDS, STUDIO_NODE_REGISTRY } from '@continuum/contracts';
import en from '../../../messages/studio/en.json';
import es from '../../../messages/studio/es.json';
import pt from '../../../messages/studio/pt-BR.json';
import { ADD_NODE_GROUPS, sectionLayout } from '../components/addNodeCatalog';
import { configFieldsFor } from './actions/actionConfig';
import { FILTER_PRESET_LABELS } from './render/effectSpec';
import { STUDIO_METADATA_KEYS, translateStudioMetadata } from './studioPresentation';

// These are published model/provider/font names or named filter presets, rather than application prose.
const invariantNames = new Set([
  'noir',
  'clarendon',
  'moon',
  'nashville',
  'Anton',
  'Montserrat',
  'Inter',
  'Cormorant Garamond',
  'Google',
  'Continuum',
  'Omni 1.1 Flash',
  'Veo 3.1 Fast',
  'Veo 3.1 Lite',
  'Veo 3.1',
  'Omni 1.1 Flash (Edit)',
  'Kling Omni',
  'Pixverse V6',
  'Seedance 2.0',
  'Fal',
  'Veo 3.1 Director',
  'Noir',
]);

function registryCopy(): Set<string> {
  const strings = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && /[A-Za-z]/.test(value)) strings.add(value);
  };
  for (const id of ACTION_IDS) {
    const definition = ACTION_DEFS[id];
    add(definition.label);
    add(definition.description);
    add(definition.group);
    if ('comingSoon' in definition) add(definition.comingSoon);
    for (const field of configFieldsFor(id)) {
      add(field.label);
      if (field.kind === 'enum') field.options.forEach(add);
    }
  }
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (['label', 'desc', 'description', 'title'].includes(key)) add(entry);
      if (Array.isArray(entry)) entry.forEach(visit);
    }
  };
  for (const group of ADD_NODE_GROUPS) {
    visit(group);
    visit(sectionLayout(group));
  }
  Object.values(STUDIO_NODE_REGISTRY).forEach(visit);
  Object.values(FILTER_PRESET_LABELS).forEach(add);
  return strings;
}

describe('studio registry presentation', () => {
  it('covers canonical action, config, node and menu metadata in all locales', () => {
    const missing = [...registryCopy()].filter(
      (copy) => !STUDIO_METADATA_KEYS[copy] && !invariantNames.has(copy),
    );
    expect(missing).toEqual([]);
    for (const key of Object.values(STUDIO_METADATA_KEYS)) {
      expect(typeof en[key]).toBe('string');
      expect(typeof pt[key]).toBe('string');
      expect(typeof es[key]).toBe('string');
    }
  });

  it('localizes metadata without changing canonical configuration values', () => {
    const toPortuguese = (source: string) => translateStudioMetadata(source, (key) => pt[key]);
    const toSpanish = (source: string) => translateStudioMetadata(source, (key) => es[key]);
    expect(toPortuguese('Image Generator')).toBe('Gerador de imagens');
    expect(toSpanish('Image Generator')).toBe('Generador de imágenes');
    expect(toPortuguese('top-left')).toBe('superior esquerdo');
    expect(toSpanish('top-left')).toBe('superior izquierdo');
    expect(toPortuguese('Veo 3.1 Fast')).toBe('Veo 3.1 Fast');
    expect(
      configFieldsFor('video.watermark').find((field) => field.key === 'position'),
    ).toMatchObject({ kind: 'enum', options: expect.arrayContaining(['top-left']) });
  });
});
