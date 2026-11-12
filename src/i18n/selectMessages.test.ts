import { describe, expect, it } from 'bun:test';
import { selectMessages } from './selectMessages';

describe('client message delivery', () => {
  it('retains only requested keys and preserves nested namespaces', () => {
    const messages = {
      common: { save: 'Salvar', retry: 'Tentar novamente' },
      editor: { toolbar: { crop: 'Recortar', rotate: 'Girar' } },
      public: { policy: 'Texto completo' },
    };
    expect(selectMessages(messages, { common: ['save'], editor: ['toolbar.crop'] })).toEqual({
      common: { save: 'Salvar' },
      editor: { toolbar: { crop: 'Recortar' } },
    });
    expect(messages.editor.toolbar.rotate).toBe('Girar');
  });
  it('fails before rendering when source scopes name unavailable messages', () => {
    expect(() => selectMessages({ common: { save: 'Save' } }, { common: ['missing'] })).toThrow(
      'Missing scoped message: common.missing',
    );
  });
});
