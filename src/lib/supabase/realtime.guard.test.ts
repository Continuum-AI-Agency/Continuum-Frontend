import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// One owner for `postgres_changes`, asserted over the tree rather than per file.
//
// A channel topic is a GLOBAL name on the browser client: `supabase.channel(topic)`
// hands back an EXISTING channel when the string matches, and `.subscribe()` flips it to
// `joining` synchronously — so a second subscriber that composes the same string gets
// that channel mid-join and its `.on('postgres_changes', …)` THROWS. In a Next app that
// lands on the global error boundary, i.e. the whole authenticated page dies.
//
// It has happened twice: the canvas composer's two run tails, and `useDesignSystem`
// mounted once by DesignSystemSection and again by the DesignSystemCard inside it. A
// third was already live and unreported — `useDocuments` keys its topic on brandId while
// DocumentNode is a React Flow node type, so two document nodes on one canvas crashed it.
//
// `subscribeToPostgresChanges` makes the collision unrepresentable by generating the
// topic. Individual call sites rot back one careless PR at a time, so the rule is
// enforced here instead of in review.
//
// BROADCAST AND PRESENCE ARE NOT COVERED, deliberately. For those the topic IS the
// rendezvous between peers — `canvas:broadcast:<brand>:<room>` must be the same string in
// every browser or multiplayer breaks. They never contain the banned literal, so they
// need no exemption and get none.

const SRC = join(import.meta.dir, '..', '..');
const OWNER = join(SRC, 'lib', 'supabase', 'realtime.ts');

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
 * Deliberately loose between `.on` and the literal.
 *
 * A tight `\.on\(` misses `channel.on<Row>('postgres_changes', …)` — which is the form
 * the helper itself uses, and the form a typed call site would naturally reach for. The
 * "owner still binds it" case below exists to catch exactly that: it failed on the first
 * draft of this file and is why the window is here.
 */
const BANNED = /\.on\b[\s\S]{0,120}?['"`]postgres_changes['"`]/;

describe('postgres_changes has exactly one owner', () => {
  const offenders = sourceFiles(SRC)
    .filter((path) => path !== OWNER)
    .filter((path) => BANNED.test(stripComments(readFileSync(path, 'utf8'))))
    .map((path) => path.slice(SRC.length + 1));

  it('is never bound outside lib/supabase/realtime.ts', () => {
    expect(offenders).toEqual([]);
  });

  it('still guards a real rule — the owner itself binds it', () => {
    expect(BANNED.test(stripComments(readFileSync(OWNER, 'utf8')))).toBe(true);
  });
});
