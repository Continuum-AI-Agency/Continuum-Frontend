import { describe, expect, it } from 'bun:test';
import { formatScheduleWithZone } from './scheduleLabel';

describe('formatScheduleWithZone', () => {
  it('names the day, time and the brand zone abbreviation', () => {
    expect(formatScheduleWithZone('2026-10-13', '10:00 AM', 'America/Los_Angeles')).toBe(
      'Tue Oct 13, 10:00 AM PDT',
    );
  });

  it('follows the zone across a DST boundary', () => {
    expect(formatScheduleWithZone('2026-11-10', '9:00 AM', 'America/Los_Angeles')).toBe(
      'Tue Nov 10, 9:00 AM PST',
    );
  });

  it('reads 24-hour labels and other zones', () => {
    expect(formatScheduleWithZone('2026-10-13', '14:30', 'Europe/London')).toBe(
      'Tue Oct 13, 2:30 PM GMT+1',
    );
  });

  it('is null for an unplaced draft', () => {
    expect(formatScheduleWithZone(null, '9:00 AM', 'UTC')).toBeNull();
  });
});
