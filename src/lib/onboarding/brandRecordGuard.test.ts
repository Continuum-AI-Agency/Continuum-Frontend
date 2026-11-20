import { describe, expect, it } from 'bun:test';
import { adoptBrandRecord, canPersistBrandRecord } from './brandRecordGuard';
import { createDefaultOnboardingState } from './state';

describe('canPersistBrandRecord', () => {
  it('allows persistence when the brand row does not exist yet (new brand)', () => {
    expect(canPersistBrandRecord(null, 'user-1')).toBe(true);
  });

  it('allows the creator to persist global fields on an existing brand', () => {
    expect(canPersistBrandRecord({ created_by: 'user-1' }, 'user-1')).toBe(true);
  });

  it('blocks a non-creator (invited member) from writing the brand record', () => {
    // The bug: an invited viewer/admin opening the brand overwrote brand_name
    // with "<their-name>'s Brand". They must be read-only on the brand row.
    expect(canPersistBrandRecord({ created_by: 'owner-1' }, 'viewer-2')).toBe(false);
  });

  it('blocks writes when the creator is unknown (defensive)', () => {
    expect(canPersistBrandRecord({ created_by: null }, 'user-1')).toBe(false);
  });
});

describe('adoptBrandRecord', () => {
  const minted = createDefaultOnboardingState({
    id: 'owner-1',
    email: 'duane@continuumai.agency',
  } as Parameters<typeof createDefaultOnboardingState>[0]);

  it("keeps a provisioned brand's name and settings instead of the minted default", () => {
    const adopted = adoptBrandRecord(minted, {
      brand_name: 'Trading Hearts — Pilot Sandbox',
      logo_path: 'logos/th.png',
      completed_at: null,
      email_report_opt_in: false,
    });
    expect(minted.brand.name).toBe("duane's Brand");
    expect(adopted.brand.name).toBe('Trading Hearts — Pilot Sandbox');
    expect(adopted.brand.logoPath).toBe('logos/th.png');
    expect(adopted.emailReportOptIn).toBe(false);
    expect(adopted.completedAt).toBeNull();
  });

  it('carries a completed brand through so onboarding does not reopen it', () => {
    const adopted = adoptBrandRecord(minted, {
      brand_name: 'Acme',
      logo_path: null,
      completed_at: '2026-11-01T00:00:00.000Z',
      email_report_opt_in: null,
    });
    expect(adopted.completedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(adopted.emailReportOptIn).toBe(true);
  });

  it('falls back to the minted name when the row has none', () => {
    const adopted = adoptBrandRecord(minted, {
      brand_name: '  ',
      logo_path: null,
      completed_at: null,
      email_report_opt_in: true,
    });
    expect(adopted.brand.name).toBe("duane's Brand");
  });
});
