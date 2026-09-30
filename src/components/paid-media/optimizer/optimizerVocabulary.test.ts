import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A vocabulary guard over the whole optimizer surface.
//
// Six separate strings in this tree explained OUR deployment topology to a media
// buyer — "expected on a local stack where the optimizer edge functions aren't
// wired", "isn't wired up for this environment", "soak tier", "soak metrics
// only". A paying user has no local stack and no environments; they read those as
// a broken product. Individual copy fixes rot back in one careless PR, so the ban
// is asserted over the directory rather than per component.

const ROOT = join(import.meta.dir);

// Terms that must never reach a user-visible string in this surface.
const BANNED = [
  'local stack',
  'edge function',
  'soak tier',
  'soak metrics',
  'this environment',
  'human-in-the-loop',
  'wired up',
];

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
 * Strip comments so the ban applies to rendered copy only. Explaining WHY a term
 * is banned necessarily uses the term, and those explanations are the reason the
 * fix survives review.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ── English only ────────────────────────────────────────────────────────────
//
// Product copy is English. The Overview, its rows, the account read and the Jaina prompts
// shipped in Spanish for a release because nothing here could fail on it; this guard is that
// failure. It reads every string literal and every JSX text run in the surface (comments
// stripped, tests and fixtures skipped) and flags an accented Spanish letter or a word that
// only exists in Spanish. Words English shares ("en", "de", "a", "y", "o") are left out on
// purpose: they collide with class names and locale tags, and a guard that cries wolf is a
// guard someone deletes. Brand, portfolio and ad-set names reach the screen as DATA, never as
// source literals, so a client's own Spanish names can never trip it.

const SPANISH_WORDS = [
  'alto',
  'medio',
  'bajo',
  'sobre',
  'del',
  'las',
  'los',
  'para',
  'hace',
  'objetivo',
  'gasto',
  'presupuesto',
  'conjunto',
  'conjuntos',
  'portafolio',
  'portafolios',
  'resultado',
  'resultados',
  'decisiones',
  'todavia',
  'ninguna',
  'ninguno',
  'cuenta',
  'lectura',
  'semana',
  'dias',
  'detalle',
  'nuevo',
  'nueva',
  'pausar',
  'revisar',
  'pendiente',
  'pendientes',
  'recomendaciones',
  'recomienda',
  'orden',
  'nombre',
  'ayer',
  'anuncio',
  'anuncios',
  'audiencia',
  'propuesta',
  'entrega',
  'ciclo',
  'cifra',
  'esperan',
  'espera',
  'tus',
  'usted',
  'ver',
  'ocultar',
  'releer',
  'preguntale',
];
const SPANISH = new RegExp(`[áéíóúñ¿¡]|\\b(${SPANISH_WORDS.join('|')})\\b`, 'i');

/** Every quoted literal, template, and JSX text run in a comment-stripped source. */
function visibleStrings(source: string): string[] {
  const pattern =
    /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g;
  return [...stripComments(source).matchAll(pattern)].map((match) => (match[1] ?? match[0]).trim());
}

/** "file: string" for every Spanish string in the surface. */
function spanishStrings(paths: readonly string[]): string[] {
  return paths.flatMap((path) =>
    visibleStrings(readFileSync(path, 'utf8'))
      .filter((text) => SPANISH.test(text))
      .map((text) => `${path.replace(ROOT, '')}: ${text}`),
  );
}

/**
 * Spanish that is known, owned elsewhere, and on its way out. Each entry names the string
 * exactly, so the list can only shrink: an exemption whose string is gone fails below and has
 * to be deleted. The portfolio workspace's disclosure is asserted verbatim by the portfolio
 * hero e2e, which belongs to the hero session; it moves to English with that test.
 */
const KNOWN_SPANISH = [
  '/sections/PortfolioDetailWorkspace.tsx: Ver detalle',
  '/sections/PortfolioDetailWorkspace.tsx: Ocultar detalle',
];

describe('optimizer user-visible vocabulary', () => {
  const files = sourceFiles(ROOT);

  it('scans a meaningful number of files (guards against a broken walker)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(BANNED)('never ships the phrase %p to a user', (term) => {
    const offenders = files.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).toLowerCase().includes(term),
    );

    expect(offenders.map((file) => file.replace(ROOT, ''))).toEqual([]);
  });

  it('ships no Spanish in a user-visible string', () => {
    const found = spanishStrings(files);
    expect(found.filter((entry) => !KNOWN_SPANISH.includes(entry))).toEqual([]);
  });

  it('keeps no exemption for Spanish that is already gone', () => {
    const found = new Set(spanishStrings(files));
    expect(KNOWN_SPANISH.filter((entry) => !found.has(entry))).toEqual([]);
  });

  it('catches Spanish copy and lets English, class names and locale tags through', () => {
    const flagged = (source: string) => visibleStrings(source).filter((text) => SPANISH.test(text));
    expect(flagged("const a = 'La cuenta gastó';")).toEqual(["'La cuenta gastó'"]);
    expect(flagged('const b = <p>Nuevo portafolio</p>;')).toEqual(['Nuevo portafolio']);
    expect(flagged('const c = `${n} conjuntos`;')).toEqual(['`${n} conjuntos`']);
    expect(flagged("const d = 'Distancia al objetivo';")).toEqual(["'Distancia al objetivo'"]);
    expect(
      flagged(
        "const e = <div className=\"space-y-2\">Spend · 7 days</div>; f('en-US'); g('3 days ago');",
      ),
    ).toEqual([]);
    // A comment may explain what used to ship; only rendered copy counts.
    expect(flagged("// 'sin objetivo' used to render here\nconst h = 'no target';")).toEqual([]);
  });

  // Proves the guard can actually fail: if stripComments ever swallowed the whole
  // file, every assertion above would pass vacuously.
  it('detects a banned term in rendered copy', () => {
    const sample = `
      // A comment mentioning a local stack is fine.
      export const Notice = () => <p>Expected on a local stack.</p>;
    `;
    expect(stripComments(sample).toLowerCase()).toContain('local stack');
    expect(stripComments(sample)).not.toContain('A comment mentioning');
  });
});
