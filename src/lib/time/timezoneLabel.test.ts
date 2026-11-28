import { describe, expect, it } from 'bun:test';

import { timezoneLabel } from './timezoneLabel';

describe('timezoneLabel', () => {
  it('names the zone in the reader’s language and keeps the city that tells zones apart', () => {
    expect(timezoneLabel('America/Bogota', 'es')).toBe('hora estándar de Colombia · Bogota');
    expect(timezoneLabel('America/Argentina/Buenos_Aires', 'en')).toBe(
      'Argentina Standard Time · Buenos Aires',
    );
  });

  it('falls back to the id for a zone the runtime cannot format', () => {
    expect(timezoneLabel('America/Cali', 'es')).toBe('America/Cali');
  });
});
