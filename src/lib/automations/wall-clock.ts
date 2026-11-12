/** A scheduled wall-clock value is not an instant; keep its timezone independent. */
export function formatAutomationWallClock(time: string, locale: string): string {
  const [hour, minute] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2024, 0, 1, hour, minute)));
}
