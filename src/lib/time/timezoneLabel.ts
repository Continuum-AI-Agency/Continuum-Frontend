/**
 * A zone as a person reads it, in their own language: 'hora estándar de Colombia · Bogota' for
 * America/Bogota under `es`. A non-technical client cannot be expected to recognise the IANA id;
 * the city stays because many zones share one name (every US East city is "Eastern Time").
 */
export function timezoneLabel(timeZone: string, locale: string): string {
  const city = timeZone.split('/').pop()?.replaceAll('_', ' ') ?? timeZone;
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
    return name ? `${name} · ${city}` : timeZone;
  } catch {
    return timeZone;
  }
}
