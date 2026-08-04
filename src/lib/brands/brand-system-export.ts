'use client';

import type {
  BrandBookResponse,
  BrandSystemBinaryAsset,
  BrandSystemExportFile,
  BrandSystemSnapshotV1,
} from '@continuum/contracts';
import { type CompiledBrandSystem, compileBrandSystem } from '@continuum/contracts';
import { zipSync } from 'fflate';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function createBrandSystemZip(files: BrandSystemExportFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((file) => [file.path, file.bytes])), { level: 6 });
}

export type BrandBookPdfRenderer = (
  snapshot: BrandSystemSnapshotV1,
  logo: BrandSystemBinaryAsset | null,
) => Promise<Uint8Array>;

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const LOGO_EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
};

type LogoLoaderDependencies = {
  signLogo: (storagePath: string) => Promise<string>;
  fetchAsset: (url: string) => Promise<Response>;
};

async function signOriginalLogo(storagePath: string): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from('brand-profile-assets')
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('Unable to sign the brand logo');
  }
  return data.signedUrl;
}

export async function loadBrandSystemLogo(
  storagePath: string,
  dependencies: Partial<LogoLoaderDependencies> = {},
): Promise<BrandSystemBinaryAsset | null> {
  const signLogo = dependencies.signLogo ?? signOriginalLogo;
  const fetchAsset = dependencies.fetchAsset ?? ((url: string) => fetch(url));
  const signedUrl = await signLogo(storagePath);
  const response = await fetchAsset(signedUrl);
  if (!response.ok) return null;

  const mediaType = (response.headers.get('content-type') ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  const extension = mediaType ? LOGO_EXTENSION_BY_MEDIA_TYPE[mediaType] : undefined;
  if (!mediaType || !extension) return null;

  const declaredSize = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredSize) && declaredSize > MAX_LOGO_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) return null;
  return { bytes, mediaType, extension };
}

type PdfDocument = InstanceType<typeof import('jspdf').jsPDF>;

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 48,
  contentWidth: 499.28,
  footerY: 810,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function pdfImageFormat(mediaType: string): 'PNG' | 'JPEG' | 'WEBP' | null {
  if (mediaType === 'image/png') return 'PNG';
  if (mediaType === 'image/jpeg' || mediaType === 'image/jpg') return 'JPEG';
  if (mediaType === 'image/webp') return 'WEBP';
  return null;
}

function renderPdfContent(
  doc: PdfDocument,
  snapshot: BrandSystemSnapshotV1,
  logo: BrandSystemBinaryAsset | null,
): void {
  let y = PAGE.margin;

  const addPage = () => {
    doc.addPage();
    y = PAGE.margin;
  };

  const ensureSpace = (height: number) => {
    if (y + height > PAGE.footerY - 18) addPage();
  };

  const paragraph = (value: string | null | undefined, options?: { muted?: boolean }) => {
    const text = value?.trim();
    if (!text) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(options?.muted ? '#626979' : '#202431');
    const lines = doc.splitTextToSize(text, PAGE.contentWidth) as string[];
    ensureSpace(lines.length * 14 + 8);
    doc.text(lines, PAGE.margin, y);
    y += lines.length * 14 + 8;
  };

  const heading = (value: string) => {
    ensureSpace(42);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor('#171a24');
    doc.text(value, PAGE.margin, y);
    y += 10;
    doc.setDrawColor('#d9dce5');
    doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    y += 20;
  };

  const label = (value: string) => {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#747b8c');
    doc.text(value.toUpperCase(), PAGE.margin, y);
    y += 14;
  };

  const bullets = (values: readonly string[]) => {
    for (const value of values) {
      const lines = doc.splitTextToSize(value, PAGE.contentWidth - 18) as string[];
      ensureSpace(lines.length * 13 + 4);
      doc.setFillColor('#5065d8');
      doc.circle(PAGE.margin + 3, y - 3, 2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#303543');
      doc.text(lines, PAGE.margin + 14, y);
      y += lines.length * 13 + 4;
    }
    y += 4;
  };

  doc.setFillColor('#f3f4fb');
  doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 116, 12, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.setTextColor('#171a24');
  doc.text(snapshot.brand.name, PAGE.margin + 22, y + 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor('#626979');
  doc.text('Brand system and authoritative guidelines', PAGE.margin + 22, y + 66);
  doc.setFontSize(9);
  doc.text('Exported from Continuum', PAGE.margin + 22, y + 88);
  if (logo) {
    const format = pdfImageFormat(logo.mediaType);
    if (format) {
      try {
        doc.addImage(logo.bytes, format, PAGE.width - PAGE.margin - 76, y + 20, 56, 56);
      } catch {
        // Unsupported/corrupt assets remain available in the ZIP; the PDF stays usable.
      }
    }
  }
  y += 136;

  heading('Identity');
  if (snapshot.identity.colors.length > 0) {
    label('Color palette');
    const swatchWidth = 92;
    snapshot.identity.colors.forEach((token, index) => {
      if (index > 0 && index % 5 === 0) y += 64;
      ensureSpace(64);
      const x = PAGE.margin + (index % 5) * 100;
      doc.setFillColor(token.value);
      doc.roundedRect(x, y, swatchWidth, 30, 5, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor('#303543');
      doc.text(token.name ?? token.role ?? 'Color', x, y + 43, { maxWidth: swatchWidth });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#747b8c');
      doc.text(token.value.toUpperCase(), x, y + 55);
    });
    y += 72;
  }
  if (snapshot.identity.typography.length > 0) {
    label('Typography');
    for (const font of snapshot.identity.typography) {
      paragraph(
        `${font.family}${font.role ? ` — ${font.role}` : ''}${font.note ? ` — ${font.note}` : ''}`,
      );
    }
  }
  if (snapshot.identity.voice) {
    label('Voice');
    paragraph(snapshot.identity.voice.tone);
    paragraph(snapshot.identity.voice.style, { muted: true });
    if (snapshot.identity.voice.power_verbs.length > 0) {
      label('Power verbs');
      bullets(snapshot.identity.voice.power_verbs);
    }
    if (snapshot.identity.voice.banned_words.length > 0) {
      label('Avoid');
      bullets(snapshot.identity.voice.banned_words);
    }
  }
  if (snapshot.identity.personality) {
    label('Personality');
    paragraph(snapshot.identity.personality.archetype);
    bullets([
      ...snapshot.identity.personality.traits,
      ...snapshot.identity.personality.descriptors,
    ]);
  }
  if (snapshot.identity.imagery) {
    label('Imagery');
    bullets([
      ...snapshot.identity.imagery.creative_direction,
      ...snapshot.identity.imagery.mood.map((item) => `Mood: ${item}`),
      ...snapshot.identity.imagery.avoid.map((item) => `Avoid: ${item}`),
    ]);
  }

  heading('Strategy');
  label('Positioning');
  paragraph(snapshot.strategy.positioning);
  if (snapshot.strategy.pillars.length > 0) {
    label('Brand pillars');
    bullets(snapshot.strategy.pillars);
  }
  label('Audience');
  paragraph(snapshot.strategy.audienceSummary);
  for (const segment of snapshot.strategy.audienceSegments) {
    paragraph(`${segment.name}${segment.jobToBeDone ? ` — ${segment.jobToBeDone}` : ''}`);
  }
  paragraph(snapshot.strategy.tonalSignal, { muted: true });

  const guidelines = asRecord(snapshot.strategy.contentGuidelines);
  const voiceRules = asRecord(guidelines.voice_rules);
  const guardrails = asRecord(guidelines.messaging_guardrails);
  const guidelineLines = [
    ...asStringArray(voiceRules.dos).map((item) => `Do: ${item}`),
    ...asStringArray(voiceRules.donts).map((item) => `Don't: ${item}`),
    ...asStringArray(guardrails.required_themes).map((item) => `Required theme: ${item}`),
    ...asStringArray(guardrails.avoid_themes).map((item) => `Avoid theme: ${item}`),
    ...asStringArray(guardrails.preferred_terms).map((item) => `Preferred term: ${item}`),
    ...asStringArray(guardrails.banned_words).map((item) => `Banned word: ${item}`),
  ];
  if (guidelineLines.length > 0) {
    label('Content rules');
    bullets(guidelineLines);
  }

  const readiness = snapshot.assessment.readiness;
  if (readiness) {
    heading('Readiness');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.setTextColor('#5065d8');
    doc.text(`${readiness.overall_score}`, PAGE.margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#626979');
    doc.text('overall readiness score', PAGE.margin + 54, y - 3);
    y += 26;
    bullets(readiness.findings.map((finding) => `${finding.headline}: ${finding.recommendation}`));
  }

  heading('Sources');
  if (snapshot.sources.documents.length === 0) {
    paragraph('No uploaded source documents are listed in this Brand Book.', { muted: true });
  } else {
    bullets(
      snapshot.sources.documents.map(
        (source) => `${source.name} — ${source.category} — ${source.status}`,
      ),
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#8a90a0');
    doc.text(`${snapshot.brand.name} · Continuum`, PAGE.margin, PAGE.footerY);
    doc.text(`${page} / ${pageCount}`, PAGE.width - PAGE.margin, PAGE.footerY, { align: 'right' });
  }
}

export async function renderBrandBookPdf(
  snapshot: BrandSystemSnapshotV1,
  logo: BrandSystemBinaryAsset | null,
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  renderPdfContent(doc, snapshot, logo);
  return new Uint8Array(doc.output('arraybuffer'));
}

export async function buildBrandSystemExport(
  input: {
    brandBook: BrandBookResponse;
    brandName: string;
    exportedAt?: string;
  },
  loadLogo: (storagePath: string) => Promise<BrandSystemBinaryAsset | null> = loadBrandSystemLogo,
): Promise<CompiledBrandSystem> {
  return compileBrandSystem({
    ...input,
    renderPdf: renderBrandBookPdf,
    loadLogo,
  });
}

function triggerDownload(bytes: Uint8Array, mediaType: string, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadBrandSystemArchive(exported: CompiledBrandSystem): void {
  triggerDownload(
    createBrandSystemZip(exported.files),
    'application/zip',
    exported.archiveFileName,
  );
}

export function downloadBrandBookPdf(exported: CompiledBrandSystem): void {
  const pdf = exported.files.find((file) => file.path === 'brand-book.pdf');
  if (!pdf) throw new Error('brand_system_pdf_missing');
  triggerDownload(pdf.bytes, pdf.mediaType, exported.pdfFileName);
}
