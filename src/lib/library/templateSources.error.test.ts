import { expect, test } from 'bun:test';
import { templateSourceErrorMessage } from './templateSources';

test('Forge errors use template language without exposing the backing service', () => {
  expect(
    templateSourceErrorMessage(
      'DRAFT_REQUIRED',
      'create the NocoBase draft before smoke testing',
      'Forge smoke',
    ),
  ).toBe('Could not start the test render because the template draft is missing. Try again.');
  expect(
    templateSourceErrorMessage('NOCOBASE_ACTION_FAILED', 'NocoBase returned 403', 'Forge draft'),
  ).toBe('Forge draft failed. Please try again.');
  expect(templateSourceErrorMessage('INVALID_NAME', 'Choose a shorter name', 'Forge draft')).toBe(
    'Choose a shorter name',
  );
});
