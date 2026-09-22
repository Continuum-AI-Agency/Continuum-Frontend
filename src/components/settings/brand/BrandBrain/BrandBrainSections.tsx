'use client';

import type { BrandColorToken, BrandFontToken } from '@continuum/contracts';
import { Plus, X } from 'lucide-react';
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
      <BrainSection title="Positioning" hint="Who you are for, and why you over the alternative.">
        <ProseField
          label="Positioning"
          hideLabel
          placeholder="For [who], [brand] is the [category] that [difference]."
          {...text(brain.positioning)}
        />
      </BrainSection>

      <BrainSection title="Pillars" hint="The themes every post ladders up to. One per line.">
        <LinesField
          label="Pillars"
          hideLabel
          placeholder="Pillar: what it covers"
          {...list(brain.pillars)}
        />
      </BrainSection>

      <BrainSection title="Voice" hint="How every caption should sound.">
        <ProseField label="Tone" maxLength={LIMITS.tone} {...text(brain.tone)} />
        <ProseField label="Style" maxLength={LIMITS.style} {...text(brain.style)} />
        <div className="grid gap-4 lg:grid-cols-2">
          <LinesField label="Do" placeholder="One rule per line" {...list(brain.dos)} />
          <LinesField label="Don't" placeholder="One rule per line" {...list(brain.donts)} />
        </div>
      </BrainSection>

      <BrainSection title="Audience" hint="The person a caption is written to.">
        <ProseField
          label="Audience"
          hideLabel
          maxLength={LIMITS.audience}
          {...text(brain.audience)}
        />
      </BrainSection>

      <BrainSection title="Promise" hint="What a customer can count on, and your tagline.">
        <ProseField label="Promise" hideLabel {...text(brain.promise)} />
      </BrainSection>

      <BrainSection title="Visual identity" hint="The colors and type every image is held to.">
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

      <BrainSection
        title="Never say"
        hint="Every caption the AI writes is told never to use these words."
      >
        <ChipsField label="Banned words" {...list(brain.bannedWords)} />
        <LinesField
          label="Themes to avoid"
          placeholder="One theme per line"
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
                aria-label={`Remove ${word}`}
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
          placeholder={full ? `${LIMITS.bannedWords} words is the limit` : 'Add a word or phrase'}
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
          Add
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
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Colors</span>
      <ul className="flex flex-col gap-2">
        {colors.map((color, index) => {
          const name = color.name ?? color.role ?? `Color ${index + 1}`;
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
                aria-label={`Remove ${name}`}
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
        <Plus aria-hidden /> Add color
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
      <span className="text-xs font-medium text-muted-foreground">Typography</span>
      <ul className="flex flex-col gap-2">
        {fonts.map((font, index) => (
          <li key={`${index}-${font.family}`} className="flex items-center gap-2">
            <Input
              defaultValue={font.family}
              onBlur={(event) => commit(index, event.target.value)}
              aria-label={`${font.role ?? 'Font'} family`}
              maxLength={240}
              disabled={disabled}
              className="max-w-xs"
            />
            <span className="text-xs capitalize text-muted-foreground">{font.role ?? 'font'}</span>
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
            aria-label="Add a font family"
            placeholder="Add a font family"
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
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
