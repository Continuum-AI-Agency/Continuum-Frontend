import { describe, expect, it } from 'bun:test';
import { LIBRARY_PRESENTATION_MAX_BYTES, LIBRARY_UPLOAD_MAX_BYTES } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import es from '../../../messages/library/es.json';
import pt from '../../../messages/library/pt-BR.json';
import { uploadSizeRefusal } from './uploadMediaAsset';
import { uploadRefusalPresentation } from './uploadRefusalPresentation';

const translate = (locale: 'pt-BR' | 'es') =>
  createTranslator({
    locale,
    messages: { library: locale === 'es' ? es : pt },
    namespace: 'library',
  });
describe('localized upload admission presentation', () => {
  it('uses the canonical refusal decision and preserves authored file names', () => {
    const file = { name: 'English recording.mp4', size: LIBRARY_UPLOAD_MAX_BYTES };
    expect(uploadRefusalPresentation(file, translate('es'), 'es')).toBe(null);
    const rejected = { ...file, size: file.size + (1024 * 1024) / 2 };
    expect(uploadSizeRefusal(rejected)).toContain('500.5 MB');
    expect(uploadRefusalPresentation(rejected, translate('es'), 'es')).toContain(
      'English recording.mp4 tiene 500,5 MB',
    );
    expect(uploadRefusalPresentation(rejected, translate('pt-BR'), 'pt-BR')).toContain(
      'English recording.mp4 tem 500,5 MB',
    );
  });
  it('presents font and presentation ceilings without parsing English prose', () => {
    expect(
      uploadRefusalPresentation({ name: 'Brand.ttf', size: 1 }, translate('es'), 'es'),
    ).toContain('Brand.ttf es una fuente');
    const message = uploadRefusalPresentation(
      { name: 'Deck.pptx', size: LIBRARY_PRESENTATION_MAX_BYTES + 1 },
      translate('es'),
      'es',
    );
    expect(message).toContain('plantillas de presentación deben tener 64 MB o menos');
  });
});
