'use client';

import type { BrandColorToken, BrandFontToken } from '@continuum/contracts';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import * as brain from './brandBrain';

// Front-matter bounds (brandMdTokensSchema). An input that overran one would produce a
// document the contract rejects, and the Brain would drop back to the raw view.
const LIMITS = { tone: 420, style: 900, audience: 900, bannedWord: 90, bannedWords: 30 };
const MAX_COLORS = 24;
const MAX_FONTS = 12;

type Props = {
  doc: brain.BrainDoc;
  onChange: (doc: brain.BrainDoc) => void;
  disabled?: boolean;
};

// Seven short sections over one brand.md. Every edit is a pure transform of the document
// (brandBrain.ts), so what Save sends is exactly what the raw view shows.
export function BrandBrainSections({ doc, onChange, disabled }: Props) {
  const tUi = useTranslations('settings');

  const text = (slice: brain.TextSlice) => ({
    value: slice.get(doc),
    onChange: (value: string) => onChange(slice.set(doc, value)),
    disabled,
  });
  const list = (slice: brain.ListSlice) => ({
    items: slice.get(doc),
    onChange: (items: readonly string[]) => onChange(slice.set(doc, items)),
    disabled,
  });

  return (
    <div className="divide-y divide-border/60" data-testid="brand-brain">
      <BrainSection title={tUi('m_86ba514122')} hint={tUi('m_e9a1216f41')}>
        <ProseField
          label={tUi('m_86ba514122')}
          hideLabel
          placeholder={tUi('m_01545686e7')}
          {...text(brain.positioning)}
        />
      </BrainSection>

      <BrainSection title={tUi('m_2727a73fb1')} hint={tUi('m_bfe82bd389')}>
        <LinesField
          label={tUi('m_2727a73fb1')}
          hideLabel
          placeholder={tUi('m_3c0b640ccb')}
          {...list(brain.pillars)}
        />
      </BrainSection>

      <BrainSection title={tUi('m_3091c8446f')} hint={tUi('m_06617d4752')}>
        <ProseField label={tUi('m_376990dbb4')} maxLength={LIMITS.tone} {...text(brain.tone)} />
        <ProseField label={tUi('m_99a0efc6cf')} maxLength={LIMITS.style} {...text(brain.style)} />
        <div className="grid gap-4 lg:grid-cols-2">
          <LinesField
            label={tUi('m_22bdf47be3')}
            placeholder={tUi('m_4796b87775')}
            {...list(brain.dos)}
          />
          <LinesField
            label={tUi('m_bfed24b7dd')}
            placeholder={tUi('m_4796b87775')}
            {...list(brain.donts)}
          />
        </div>
      </BrainSection>

      <BrainSection title={tUi('m_51d9934555')} hint={tUi('m_be3b307838')}>
        <ProseField
          label={tUi('m_51d9934555')}
          hideLabel
          maxLength={LIMITS.audience}
          {...text(brain.audience)}
        />
      </BrainSection>

      <BrainSection title={tUi('m_fe5671922b')} hint={tUi('m_eefda4aa0d')}>
        <ProseField label={tUi('m_fe5671922b')} hideLabel {...text(brain.promise)} />
      </BrainSection>

      <BrainSection title={tUi('m_1f6f173d06')} hint={tUi('m_324cba8f62')}>
        <ColorsField
          colors={doc.tokens.colors}
          onChange={(colors) => onChange(brain.withColors(doc, colors))}
          disabled={disabled}
        />
        <FontsField
          fonts={doc.tokens.typography}
          onChange={(fonts) => onChange(brain.withFonts(doc, fonts))}
          disabled={disabled}
        />
      </BrainSection>

      <BrainSection title={tUi('m_2c5cd2e3e7')} hint={tUi('m_61bb056c51')}>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          {tUi('m_eae876f5b8')}
          <select
            aria-label={tUi('m_5126701a3c')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            disabled={disabled}
            value={doc.tokens.logo?.treatment_default ?? 'palette-only'}
            onChange={(event) =>
              onChange(brain.withLogoTreatment(doc, event.target.value as 'palette-only' | 'logo'))
            }
          >
            <option value="palette-only">{tUi('m_7cd97cdc7d')}</option>
            <option value="logo">{tUi('m_2e9507e2ce')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            disabled={disabled}
            checked={doc.tokens.generation?.number_slides ?? false}
            onChange={(event) =>
              onChange(
                brain.withGenerationPreferences(doc, { number_slides: event.target.checked }),
              )
            }
          />
          {tUi('m_3cc7f2ca6b')}
        </label>
        {doc.tokens.colors.length > 0 ? (
          <fieldset className="space-y-2" disabled={disabled}>
            <legend className="text-xs font-medium text-muted-foreground">
              {tUi('m_86cd8848f5')}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {doc.tokens.colors.map((color) => {
                const avoided = doc.tokens.generation?.avoid_colors.includes(color.value) ?? false;
                return (
                  <label
                    key={color.value}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={avoided}
                      onChange={(event) => {
                        const current = doc.tokens.generation?.avoid_colors ?? [];
                        const avoidColors = event.target.checked
                          ? [...current, color.value]
                          : current.filter((value) => value !== color.value);
                        onChange(
                          brain.withGenerationPreferences(doc, { avoid_colors: avoidColors }),
                        );
                      }}
                    />
                    <span
                      className="h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: color.value }}
                    />
                    {color.name ?? color.value}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="generation-guidance"
          >
            {tUi('m_fd18a765f3')}
          </label>
          <Textarea
            id="generation-guidance"
            maxLength={1200}
            disabled={disabled}
            value={doc.tokens.generation?.additional_guidance ?? ''}
            placeholder={tUi('m_fde3022ab8')}
            onChange={(event) =>
              onChange(
                brain.withGenerationPreferences(doc, {
                  additional_guidance: event.target.value || undefined,
                }),
              )
            }
          />
        </div>
      </BrainSection>

      <BrainSection title={tUi('m_ae292cb28d')} hint={tUi('m_f15605009d')}>
        <ChipsField label={tUi('m_7455fac9c6')} {...list(brain.bannedWords)} />
        <LinesField
          label={tUi('m_d4efaee90f')}
          placeholder={tUi('m_69ca00409b')}
          {...list(brain.avoidThemes)}
        />
      </BrainSection>
    </div>
  );
}

function BrainSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-3 py-5 first:pt-1 last:pb-1 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] md:gap-8"
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-medium text-foreground">
          {title}
        </h3>
        <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

// A section with one field is already named by its heading; the label stays for screen readers.
function FieldLabel({
  htmlFor,
  hidden,
  children,
}: {
  htmlFor: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={hidden ? 'sr-only' : 'text-xs font-medium text-muted-foreground'}
    >
      {children}
    </label>
  );
}

function ProseField({
  label,
  hideLabel,
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} hidden={hideLabel}>
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="min-h-10"
      />
    </div>
  );
}

// One item per line. The textarea keeps its own text so a blank line being typed is not
// swallowed by the round trip; it re-syncs only when the list changes underneath it
// (a revert, a raw edit).
function LinesField({
  label,
  hideLabel,
  items,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  hideLabel?: boolean;
  items: string[];
  onChange: (items: readonly string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const joined = items.join('\n');
  const [text, setText] = useState(joined);
  useEffect(() => {
    setText((current) =>
      brain.cleanList(current.split('\n')).join('\n') === joined ? current : joined,
    );
  }, [joined]);
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} hidden={hideLabel}>
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(event.target.value.split('\n'));
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-10"
      />
    </div>
  );
}

function ChipsField({
  label,
  items,
  onChange,
  disabled,
}: {
  label: string;
  items: string[];
  onChange: (items: readonly string[]) => void;
  disabled?: boolean;
}) {
  const tUi = useTranslations('settings');

  const id = useId();
  const [entry, setEntry] = useState('');
  const full = items.length >= LIMITS.bannedWords;

  const add = () => {
    const word = entry.trim();
    if (!word) return;
    const known = items.some((item) => item.toLowerCase() === word.toLowerCase());
    if (!known) onChange([...items, word]);
    setEntry('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    add();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((word) => (
            <li
              key={word}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 py-0.5 pr-1 pl-2.5 text-xs text-foreground"
            >
              {word}
              <button
                type="button"
                onClick={() => onChange(items.filter((item) => item !== word))}
                disabled={disabled}
                aria-label={tUi('m_a31c68e147', { v0: String(word) })}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={LIMITS.bannedWord}
          placeholder={
            full ? tUi('m_0ee9cc2956', { v0: String(LIMITS.bannedWords) }) : tUi('m_79a619c938')
          }
          disabled={disabled || full}
          className="max-w-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={disabled || full || !entry.trim()}
        >
          {tUi('m_61cc55aa04')}
        </Button>
      </div>
    </div>
  );
}

function ColorsField({
  colors,
  onChange,
  disabled,
}: {
  colors: BrandColorToken[];
  onChange: (colors: BrandColorToken[]) => void;
  disabled?: boolean;
}) {
  const tUi = useTranslations('settings');

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{tUi('m_88d5e4cac1')}</span>
      <ul className="flex flex-col gap-2">
        {colors.map((color, index) => {
          const name = color.name ?? color.role ?? tUi('brandColorFallback', { index: index + 1 });
          return (
            <li key={`${index}-${color.role ?? ''}`} className="flex items-center gap-2">
              <ColorField
                label={name}
                value={color.value}
                onChange={(value) =>
                  onChange(colors.map((c, i) => (i === index ? { ...c, value } : c)))
                }
                disabled={disabled}
                className="max-w-36 flex-none"
              />
              <span className="min-w-0 truncate text-xs capitalize text-muted-foreground">
                {name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(colors.filter((_, i) => i !== index))}
                disabled={disabled}
                aria-label={tUi('m_a31c68e147', { v0: String(name) })}
              >
                <X aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...colors, { value: '#808080' }])}
        disabled={disabled || colors.length >= MAX_COLORS}
        className="self-start"
      >
        <Plus aria-hidden />
        {tUi('m_7ff255d8ab')}
      </Button>
    </div>
  );
}

// A font family is committed on blur: the contract has no empty family, so a field being
// retyped from scratch must not write one. Clearing it and leaving removes the font.
function FontsField({
  fonts,
  onChange,
  disabled,
}: {
  fonts: BrandFontToken[];
  onChange: (fonts: BrandFontToken[]) => void;
  disabled?: boolean;
}) {
  const tUi = useTranslations('settings');

  const addId = useId();
  const [entry, setEntry] = useState('');
  const add = () => {
    const family = entry.trim();
    if (!family) return;
    onChange([...fonts, { family }]);
    setEntry('');
  };
  const commit = (index: number, family: string) => {
    const next = family.trim();
    if (next === fonts[index]?.family) return;
    onChange(
      next
        ? fonts.map((font, i) => (i === index ? { ...font, family: next } : font))
        : fonts.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{tUi('m_f4beb9af58')}</span>
      <ul className="flex flex-col gap-2">
        {fonts.map((font, index) => (
          <li key={`${index}-${font.family}`} className="flex items-center gap-2">
            <Input
              defaultValue={font.family}
              onBlur={(event) => commit(index, event.target.value)}
              aria-label={tUi('m_9a76d3f709', { v0: String(font.role ?? 'Font') })}
              maxLength={240}
              disabled={disabled}
              className="max-w-xs"
            />
            <span className="text-xs capitalize text-muted-foreground">
              {font.role ?? tUi('m_4642576d84')}
            </span>
          </li>
        ))}
      </ul>
      {fonts.length < MAX_FONTS ? (
        <div className="flex gap-2">
          <Input
            id={addId}
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              add();
            }}
            aria-label={tUi('m_d1e5213c4d')}
            placeholder={tUi('m_d1e5213c4d')}
            maxLength={240}
            disabled={disabled}
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={disabled || !entry.trim()}
          >
            {tUi('m_61cc55aa04')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
