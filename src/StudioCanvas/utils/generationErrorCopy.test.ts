import { describe, expect, it } from 'bun:test';
import { generationErrorCopy } from './generationErrorCopy';

describe('generationErrorCopy', () => {
  it('tells the user what to change when the model returned nothing', () => {
    const copy = generationErrorCopy('image_empty_response', 'No image returned by Gemini.');

    expect(copy.title).toBe('No image came back');
    expect(copy.guidance).toContain('Change the prompt or the reference images');
  });

  it('names the safety block rather than the finish reason', () => {
    expect(generationErrorCopy('image_blocked', 'finishReason=IMAGE_SAFETY').title).toBe(
      'This image was blocked',
    );
  });

  /*
   * A workspace without fal credits got "Generation failed — Forbidden" on FLUX.2 Max
   * (Airtable #248): an HTTP status where an instruction belonged. The Backend now sends
   * `model_unavailable` with a message naming the model, and that message has to survive
   * into the panel — it is the only place the user learns WHICH model was refused.
   */
  describe('model_unavailable', () => {
    it('replaces "Forbidden" with the model and the way out', () => {
      // The exact sentence the Backend's FalModelUnavailableError sends on a 403.
      const copy = generationErrorCopy(
        'model_unavailable',
        'FLUX.2 Max is not enabled on this workspace. Pick another model, or ask an admin to enable it.',
      );

      expect(copy.title).toBe("This model isn't available");
      expect(copy.title).not.toContain('Forbidden');
      expect(copy.guidance).toContain('FLUX.2 Max is not enabled on this workspace.');
      expect(copy.guidance).toContain('Nano Banana 2 is the closest match.');
      expect(copy.guidance).not.toContain('Forbidden');
    });

    it('still says something actionable when the Backend sent no message', () => {
      const copy = generationErrorCopy('model_unavailable', '   ');

      expect(copy.title).toBe("This model isn't available");
      expect(copy.guidance).toContain('Pick another model');
    });
  });

  it('falls back to the raw provider message for a code it does not know', () => {
    const copy = generationErrorCopy('some_new_backend_code', 'Vertex is unreachable');

    expect(copy.title).toBe('Generation failed');
    expect(copy.guidance).toBe('Vertex is unreachable');
  });

  it('never leaves the panel blank when there is no message at all', () => {
    expect(generationErrorCopy(undefined, undefined).guidance).toBe(
      'Something went wrong while generating. Try again.',
    );
  });
});
