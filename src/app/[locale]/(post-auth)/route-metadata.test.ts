import { describe, expect, it } from 'bun:test';
import { metadata as adminMetadata } from './admin/layout';
import { metadata as aiStudioMetadata } from './ai-studio/layout';
import { metadata as organicMetadata } from './organic/layout';
import { metadata as scaleMetadata } from './scale/layout';
import { metadata as settingsMetadata } from './settings/layout';

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

  it('gives Settings its own document title', () => {
    expect(settingsMetadata.title).toBe('Settings | Continuum AI');
  });

  it('gives Admin its own document title', () => {
    expect(adminMetadata.title).toBe('Admin | Continuum AI');
  });

  it('keeps every post-auth shell title distinct', () => {
    const titles = [
      aiStudioMetadata.title,
      organicMetadata.title,
      scaleMetadata.title,
      settingsMetadata.title,
      adminMetadata.title,
    ];

    expect(new Set(titles).size).toBe(titles.length);
  });
});
