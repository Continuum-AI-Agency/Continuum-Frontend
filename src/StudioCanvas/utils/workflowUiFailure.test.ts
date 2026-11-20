import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { ApiError } from '@/lib/api/errors';
import en from '../../../messages/studio/en.json';
import es from '../../../messages/studio/es.json';
import pt from '../../../messages/studio/pt-BR.json';
import {
  WorkflowUiError,
  workflowFailure,
  workflowFailureFromError,
  workflowNodeError,
  workflowUiText,
} from './workflowUiFailure';

const translate = (locale: 'en' | 'pt-BR' | 'es') =>
  createTranslator({
    locale,
    messages: { studio: locale === 'en' ? en : locale === 'pt-BR' ? pt : es },
    namespace: 'studio',
  });
describe('workflow UI failure presentation', () => {
  it('reformats transient failure metadata in the current locale without changing raw diagnostics', () => {
    const data = {
      error: 'Missing required prompt',
      uiFailure: workflowFailure('workflow_missing_required_prompt_fd8a0824'),
    };
    expect(workflowNodeError(data, translate('pt-BR'))).toBe('Falta o prompt obrigatório');
    expect(workflowNodeError(data, translate('es'))).toBe('Falta el prompt obligatorio');
    expect(data.error).toBe('Missing required prompt');
  });
  it('preserves authored labels while localizing registered source names', () => {
    const authored = workflowFailure('workflow_the_value0_input_is_waiting_on_d9483d34', {
      input: 'ref-image',
      source: 'My Image',
      sourceKind: 'named',
    });
    expect(workflowUiText(authored, translate('es'))).toContain('My Image');
    const registered = { ...authored, metadataValues: { source: 'Video Editor' } };
    expect(workflowUiText(registered, translate('pt-BR'))).toContain('Editor de vídeo');
    expect(
      workflowUiText(
        workflowFailure('workflow_the_value0_input_is_waiting_on_d9483d34', {
          input: 'ref-image',
          source: '',
          sourceKind: 'unknown',
        }),
        translate('es'),
      ),
    ).toContain('el nodo conectado');
  });
  it('uses ICU plurals and media-kind selects', () => {
    expect(
      workflowUiText(
        workflowFailure('workflow_only_the_first_value0_items_wi_69c7dd2d', { count: 1 }),
        translate('es'),
      ),
    ).toBe('Solo se ejecutará el primer elemento.');
    expect(
      workflowUiText(
        workflowFailure('workflow_value0_of_value1_items_failed_858fc89a', { failed: 2, total: 3 }),
        translate('pt-BR'),
      ),
    ).toBe('2 de 3 itens falharam');
    expect(
      workflowUiText(
        workflowFailure('workflow_connect_value0_to_value1_998a2f82', {
          kind: 'image',
          input: 'in',
        }),
        translate('es'),
      ),
    ).toBe('Conecta una imagen a "in"');
  });
  it('maps status and typed app errors without exposing provider messages', () => {
    const diagnostic = 'private provider failure details';
    expect(
      workflowUiText(workflowFailureFromError(new Error(diagnostic)), translate('es')),
    ).not.toContain(diagnostic);
    expect(workflowFailureFromError(new ApiError(diagnostic, 401)).code).toBe(
      'workflow_your_session_expired_sign_in_a_14f32048',
    );
    const typed = new WorkflowUiError(
      diagnostic,
      workflowFailure('workflow_missing_required_prompt_fd8a0824'),
    );
    expect(workflowFailureFromError(typed)).toBe(typed.uiFailure);
    expect(typed.message).toBe(diagnostic);
  });
  it('retains canonical generation guidance and rejects unrecognized transient metadata', () => {
    const data = {
      error: 'private diagnostic',
      errorCode: 'image_blocked',
      uiFailure: workflowFailure('workflow_this_node_could_not_complete_r_4bbf0954'),
    };
    expect(workflowNodeError(data, translate('es'))).not.toContain('private');
    const explicit = {
      ...data,
      uiFailure: workflowFailure('workflow_missing_required_prompt_fd8a0824'),
    };
    expect(workflowNodeError(explicit, translate('es'))).toBe('Falta el prompt obligatorio');
    expect(
      workflowNodeError({ error: 'legacy', uiFailure: { code: 'unknown' } }, translate('es')),
    ).toBe('legacy');
  });
});
