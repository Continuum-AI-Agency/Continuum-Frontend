import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// No `postgres_changes` subscription anywhere, asserted over the tree rather than per file.
//
// While ANY postgres_changes subscription exists, Supabase Realtime polls the database and
// decodes the whole WAL several times a second — it was a quarter of all DB time
// (realtime.list_changes). Every table the app watches is pushed by a trigger onto a private
// Broadcast topic instead (`subscribeToRowBroadcasts`, supabase/migrations/
// 20261028070000_realtime_row_broadcasts.sql and 20261028092000_realtime_row_broadcasts_rest.sql),
// so one careless `.on('postgres_changes', …)` would quietly turn the poller back on for
// every open tab. A new table to watch needs a trigger, a topic rule and a frontend topic.
//
// BROADCAST AND PRESENCE ARE NOT COVERED, deliberately: peer channels (canvas cursors,
// presence) never contain the banned literal, so they need no exemption and get none.

const SRC = join(import.meta.dir, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/**
 * Strip comments before matching. Explaining WHY the call is banned necessarily writes
 * it out — including in this file's own header and the helper's — and those explanations
 * are the reason the rule survives review.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Deliberately loose between `.on` and the literal, so the typed form
 * `channel.on<Row>('postgres_changes', …)` is caught as well as the plain one.
 */
const BANNED = /\.on\b[\s\S]{0,120}?['"`]postgres_changes['"`]/;

describe('postgres_changes has no subscriber', () => {
  const offenders = sourceFiles(SRC)
    .filter((path) => BANNED.test(stripComments(readFileSync(path, 'utf8'))))
    .map((path) => path.slice(SRC.length + 1));

  it('is never bound in src', () => {
    expect(offenders).toEqual([]);
  });

  it('still guards a real rule — both forms of the binding match', () => {
    expect(BANNED.test("channel.on('postgres_changes', { event: 'INSERT' }, cb)")).toBe(true);
    expect(BANNED.test('channel.on<Row>(\n  "postgres_changes",\n  filter,\n  cb)')).toBe(true);
    expect(BANNED.test("channel.on('broadcast', { event: '*' }, cb)")).toBe(false);
  });
});
