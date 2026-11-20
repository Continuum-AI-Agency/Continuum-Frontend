import { describe, expect, it, mock } from 'bun:test';
import { createTranslator } from 'next-intl';
import { englishMessages } from '@/i18n/__tests__/render';

// Admin and Settings translate their titles on the server; outside an RSC request the real
// next-intl/server throws, so they are given the English catalogs. `mock.module` is not
// hoisted, so the layouts are imported after it.
const intlServer = await import('next-intl/server');
mock.module('next-intl/server', () => ({
  ...intlServer,
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: 'en', messages: englishMessages, namespace }),
}));

const { generateMetadata: adminMetadata } = await import('./admin/layout');
const { metadata: aiStudioMetadata } = await import('./ai-studio/layout');
const { metadata: organicMetadata } = await import('./organic/layout');
const { metadata: scaleMetadata } = await import('./scale/layout');
const { generateMetadata: settingsMetadata } = await import('./settings/layout');

describe('post-auth route metadata', () => {
  it('gives AI Studio its own document title', () => {
    expect(aiStudioMetadata.title).toBe('AI Studio | Continuum AI');
  });

  it('gives Organic its own document title', () => {
    expect(organicMetadata.title).toBe('Organic | Continuum AI');
  });

  it('gives Scale its own document title', () => {
    expect(scaleMetadata.title).toBe('Scale | Continuum AI');
  });

  it('gives Settings its own document title', async () => {
    expect((await settingsMetadata()).title).toBe('Settings | Continuum AI');
  });

  it('gives Admin its own document title', async () => {
    expect((await adminMetadata()).title).toBe('Admin | Continuum AI');
  });

  it('keeps every post-auth shell title distinct', async () => {
    const titles = [
      aiStudioMetadata.title,
      organicMetadata.title,
      scaleMetadata.title,
      (await settingsMetadata()).title,
      (await adminMetadata()).title,
    ];

    expect(new Set(titles).size).toBe(titles.length);
  });
});
