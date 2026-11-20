import { describe, expect, it } from 'bun:test';
import {
  messageArgumentKinds,
  messageArguments,
  translatedMachineValues,
  untranslatedUi,
  validateCatalogs,
} from './check.mjs';

describe('translation release checks', () => {
  it('follows scoped display constants and prop defaults without mixing component bindings', () => {
    const source =
      "function A(){const label='Loading accounts…';return <span>{label}</span>} function B({label='Select account'}){return <Button aria-label={label}/>} function C(){const label=t('ready');return <span>{label}</span>}";
    expect(
      untranslatedUi(source, 'Accounts.tsx').map((item: { text: string }) => item.text),
    ).toEqual(['Loading accounts…', 'Select account']);
    expect(
      translatedMachineValues(
        "function Tile(){const t=useTranslations('scale');return <KpiTile value={t('count')}/>}",
        'Tile.tsx',
      ),
    ).toEqual([]);
  });
  it('keeps rich-text argument kinds compatible and rejects invalid static render bindings', () => {
    expect(
      messageArgumentKinds('{count,plural,one {<items>#</items>} other {<items># {name}</items>}}'),
    ).toEqual({ count: 'value', items: 'tag', name: 'value' });
    expect(
      messageArguments('{count,plural,one {<items>#</items>} other {<items># {name}</items>}}'),
    ).toEqual(['count', 'items', 'name']);
    expect(messageArgumentKinds('Spend<v0>{amount,number}</v0>')).toEqual({
      amount: 'value',
      v0: 'tag',
    });
    expect(
      validateCatalogs({
        en: { spend: 'Spend<v0></v0>' },
        'pt-BR': { spend: 'Gasto{v0}' },
        es: { spend: 'Gasto<v0></v0>' },
      }).some((failure: string) => failure.includes('interpolation')),
    ).toBe(true);
    const bindings = new Map([
      ['spend', [{ v0: 'tag' }]],
      ['amount', [{ v0: 'value' }]],
    ]);
    expect(
      untranslatedUi(
        "const code='MXN'; t.rich('spend',{v0:code}); t.rich('amount',{v0:()=>code});",
        'Table.tsx',
        bindings,
      ).map((finding: { kind: string }) => finding.kind),
    ).toEqual(['ICU binding', 'ICU binding']);
    expect(
      untranslatedUi(
        "const renderValue=()=>null; t.rich('spend',{v0:renderValue}); t.rich('spend',{v0:()=>null}); t('amount',{v0:'MXN'});",
        'Table.tsx',
        bindings,
      ),
    ).toEqual([]);
  });
  it('refuses displaced client or server directives that would change the RSC boundary', () => {
    expect(() =>
      untranslatedUi(
        "import React from 'react'; ('use client'); export const Card=()=>null;",
        'Card.tsx',
      ),
    ).toThrow('directive must precede imports');
    expect(() => untranslatedUi("import x from './x'; 'use server';", 'action.ts')).toThrow(
      'directive must precede imports',
    );
    expect(
      untranslatedUi(
        "'use client'; import React from 'react'; export const Card=()=>null;",
        'Card.tsx',
      ),
    ).toEqual([]);
  });
  it('checks nested ICU arguments, plural branches and rich text', () => {
    expect(
      messageArguments('{count, plural, one {Hi {name}} other {Hello <b>{name}</b>}}'),
    ).toEqual(['b', 'count', 'name']);
    expect(
      validateCatalogs({
        en: { welcome: 'Hello {name}' },
        'pt-BR': { welcome: 'Olá {other}' },
        es: { welcome: 'Hola {name}' },
      }).some((failure: string) => failure.includes('interpolation')),
    ).toBe(true);
  });
  it('refuses missing keys, empty catalogs and English-filled locale catalogs', () => {
    expect(validateCatalogs({ en: {}, 'pt-BR': {}, es: {} }).length).toBeGreaterThan(0);
    expect(
      validateCatalogs({ en: { save: 'Save' }, 'pt-BR': { save: 'Save' }, es: {} }).length,
    ).toBeGreaterThan(1);
    expect(
      validateCatalogs({
        en: { save: 'Save' },
        'pt-BR': { save: 'Salvar' },
        es: { save: 'Guardar' },
      }),
    ).toEqual([]);
  });
  it('finds visible literals while preserving protocol values, user data and source examples', () => {
    const findings = untranslatedUi(
      'const Screen = () => <div data-mode="edit"><h1>Save draft</h1><input placeholder="Email address"/><code>const value = 1</code>{user.title}<p>{t("saved")}</p></div>',
      'Screen.tsx',
    );
    expect(findings.map((finding: { text: string }) => finding.text)).toEqual([
      'Save draft',
      'Email address',
    ]);
  });
  it('rejects translated protocol values while allowing localized labels', () => {
    const source = `function Card() { const t = useTranslations('common'); return <SelectItem value={t('owner')} aria-label={t('owner')}>{status === t('ready') ? t('yes') : t('no')}</SelectItem> }`;
    expect(
      translatedMachineValues(source, 'Card.tsx').map((item: { kind: string }) => item.kind),
    ).toEqual(['machine attribute value', 'comparison']);
  });
  it('follows translated aliases into machine lookups without rejecting visible labels', () => {
    const source = `function Card() { const t = useTranslations('common'); const state = active ? 'active' : t('none'); const label = t('ready'); return <span className={STYLES[state]}>{label}</span>; }`;
    expect(
      translatedMachineValues(source, 'Card.tsx').some(
        (item: { kind: string }) => item.kind === 'computed lookup',
      ),
    ).toBe(true);
    expect(
      translatedMachineValues(
        `function Card() { const t = useTranslations('common'); const label = t('ready'); return <span>{label}</span>; }`,
        'Card.tsx',
      ),
    ).toEqual([]);
  });
  it('detects sentence templates and conditional display labels without treating values as copy', () => {
    const source =
      'const Card = () => <div><span>{ready ? "Ready to publish" : user.title}</span><button aria-label={`Open ${name}`}>{t("open")}</button><input value={ready ? "live" : "draft"}/></div>';
    expect(untranslatedUi(source, 'Card.tsx').map((item: { text: string }) => item.text)).toEqual([
      'Ready to publish',
      'Open {value}',
    ]);
  });
  it('allows localized search labels, presence checks and ordinary object property names', () => {
    const source = `function Card() { const t = useTranslations('common'); const reason = t('reason'); const product = t(KEYS[body.product]); return <CommandItem value={reason} disabled={reason !== null} className={reason && 'muted'}>{product}</CommandItem>; }`;
    expect(translatedMachineValues(source, 'Card.tsx')).toEqual([]);
  });
  it('rejects translated helper values used as case labels or machine predicate arguments', () => {
    const source = `function run(ui, ctx) { const label = ui.t('ready'); if (codes.includes(label)) return true; switch (state) { case ctx.translate('failed'): return false; } }`;
    expect(
      translatedMachineValues(source, 'helper.ts').map((item: { kind: string }) => item.kind),
    ).toEqual(['machine predicate', 'switch value']);
  });
  it('checks optional notification callbacks and component tooltip text', () => {
    const source =
      "function run(controls){controls.show?.({title:'Render ready',description:'Choose a download'});return <Button tooltip='Save your work'/>}";
    expect(untranslatedUi(source, 'helper.tsx').map((item: { text: string }) => item.text)).toEqual(
      ['Render ready', 'Choose a download', 'Save your work'],
    );
  });
  it('checks authentication HTML responses without treating inline script diagnostics as UI', () => {
    const source =
      'const html = `<!DOCTYPE html><html><body><p>${ready ? "Authentication complete" : "Authentication failed"}</p><script>console.error("private diagnostic")</script></body></html>`;';
    expect(
      untranslatedUi(source, 'src/app/oauth/callback/route.ts').map(
        (item: { text: string }) => item.text,
      ),
    ).toEqual(['Authentication complete', 'Authentication failed']);
  });
});
