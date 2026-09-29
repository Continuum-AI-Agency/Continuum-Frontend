import { describe, expect, it } from 'bun:test';
import {
  normalizePersistedObjectiveStatus,
  objectiveReasonText,
  summarizeObjectiveProgress,
} from './objectiveStatus';

describe('normalizePersistedObjectiveStatus', () => {
  it('keeps every status the backend settles on, so a reload shows what the turn ended as', () => {
    for (const status of [
      'pending',
      'in_progress',
      'completed',
      'partial',
      'deferred',
      'blocked',
      'failed',
      'cancelled',
    ]) {
      expect(normalizePersistedObjectiveStatus(status)).toBe(status);
    }
  });

  it('still folds legacy spellings onto the canonical status', () => {
    expect(normalizePersistedObjectiveStatus('Done')).toBe('completed');
    expect(normalizePersistedObjectiveStatus('running')).toBe('in_progress');
    expect(normalizePersistedObjectiveStatus('error')).toBe('failed');
    expect(normalizePersistedObjectiveStatus('canceled')).toBe('cancelled');
    expect(normalizePersistedObjectiveStatus(undefined)).toBe('pending');
  });
});

describe('objectiveReasonText', () => {
  it('says which read never ran, in words, never the tool name', () => {
    expect(
      objectiveReasonText(
        'required_tool_not_run',
        'Required read never ran this turn: get_breakdown_insights_summary.',
      ),
    ).toBe('No se pudo leer el desglose por segmento');
    expect(objectiveReasonText('required_tool_not_run', null)).toBe(
      'No se pudo leer un dato que necesitaba',
    );
  });

  it('turns each runtime code into a plain sentence and hides codes it does not know', () => {
    expect(objectiveReasonText('core_deferred', 'Deferred by Jaina core: x')).toBe(
      'Quedó para la próxima',
    );
    expect(objectiveReasonText('turn_ended_in_progress', null)).toBe('Se cortó antes de terminar');
    expect(objectiveReasonText('worker_exception', 'boom')).toBe('Falló al consultar los datos');
    expect(objectiveReasonText('some_new_code', 'internal')).toBeNull();
    expect(objectiveReasonText(null, null)).toBeNull();
  });
});

describe('summarizeObjectiveProgress', () => {
  it('counts completed over total and reports partial on its own', () => {
    expect(
      summarizeObjectiveProgress([
        { status: 'completed' },
        { status: 'partial' },
        { status: 'deferred' },
      ]),
    ).toEqual({ completed: 1, partial: 1, total: 3 });
  });
});
