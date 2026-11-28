import { describe, expect, mock, test } from 'bun:test';
import { brandBookResponseSchema } from '@continuum/contracts';
import { screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock() }),
}));

const { BrandDnaPanel, BrandSourcesPanel } = await import('./BrandBookView');

const COMPOSITE = {
  brand_profile: { id: 'brand-1', brand_name: 'Acme', website_url: 'https://wrong.example' },
  structured: {
    connected_accounts: [],
    website: { website_url: 'https://wrong.example' },
    documents: {},
    target_audience: {
      summary: 'Patients in Miami',
      segments: [{ name: 'Retirees', jtbd: 'Fix a crown before a cruise' }],
    },
    business: null,
  },
  understanding: {
    positioning_thesis: 'A dental clinic in Miami.',
    hypothesis_icp: 'Patients',
    tonal_signal: 'warm',
    brand_pillars: ['Smiles'],
    notable_evidence: [],
  },
};

const EDITED_MD = [
  '---',
  'brand_name: Acme',
  'voice:',
  '  tone: plain-spoken and local',
  'audience:',
  '  primary_summary: Commuters and tourists in Cali',
  '---',
  '## Positioning',
  'Acme rents bikes in Cali.',
  '',
  '## Brand pillars',
  '- Mobility',
  '',
  '## Voice',
  'Do: say the daily price',
  '',
].join('\n');

function book(edited: boolean) {
  return brandBookResponseSchema.parse({
    brand_id: 'brand-1',
    status: 'ready',
    present: true,
    composite: COMPOSITE,
    brand_md: EDITED_MD,
    brand_md_is_edited: edited,
  });
}

describe('BrandDnaPanel', () => {
  test('the strategy card shows the description the user edited, not the stale analysis', () => {
    render(<BrandDnaPanel brandBook={book(true)} canEdit reanalysisPayload={null} />);

    // The editor below renders the same text in its fields; the card is the paragraph.
    const shown = screen.getAllByText('Acme rents bikes in Cali.').map((el) => el.tagName);
    expect(shown).toContain('P');
    expect(screen.queryByText('A dental clinic in Miami.')).toBeNull();
    expect(screen.queryByText('Smiles')).toBeNull();
    // Keyboard and screen-reader users land in the editor, not back on the button.
    screen.getByRole('button', { name: /Edit Brand DNA/ }).click();
    expect(document.activeElement?.id).toBe('brand-dna-editor');
  });

  test('the tone, audience and rules cards show the edit too, as agents read it', () => {
    render(<BrandDnaPanel brandBook={book(true)} canEdit reanalysisPayload={null} />);

    const paragraphs = (text: string) =>
      screen.getAllByText(text).filter((el) => el.tagName === 'P').length;
    expect(paragraphs('plain-spoken and local')).toBe(1);
    expect(paragraphs('Commuters and tourists in Cali')).toBe(1);
    expect(screen.getAllByText('say the daily price').length).toBeGreaterThan(0);
    expect(screen.queryByText('warm')).toBeNull();
    expect(screen.queryByText('Patients in Miami')).toBeNull();
    // brand.md has no segments: the analysis's segments describe the audience the edit replaced.
    expect(screen.queryByText('Retirees')).toBeNull();
    expect(screen.queryByText('Fix a crown before a cruise')).toBeNull();
  });

  test('Edit lands on the structured editor: fields, not raw markdown', () => {
    render(<BrandDnaPanel brandBook={book(true)} canEdit reanalysisPayload={null} />);

    // The Brand Brain view is the default tab for a parseable doc; tone and colours are fields.
    const tone = screen
      .getAllByDisplayValue('plain-spoken and local')
      .find((el) => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
    expect(tone).toBeTruthy();
    expect(screen.getByRole('tab', { selected: true }).textContent).not.toMatch(/raw|markdown/i);
  });

  test('without an edit the analysis stands', () => {
    render(<BrandDnaPanel brandBook={book(false)} canEdit reanalysisPayload={null} />);

    expect(screen.getByText('A dental clinic in Miami.')).toBeTruthy();
    expect(screen.getByText('Retirees')).toBeTruthy();
  });

  test('a viewer gets a read-only notice instead of the edit actions', () => {
    render(<BrandDnaPanel brandBook={book(false)} canEdit={false} reanalysisPayload={null} />);

    expect(screen.queryByRole('button', { name: /Edit Brand DNA/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Re-analyze from website/ })).toBeNull();
    expect(
      screen.getByText('Only brand owners, admins and operators can change the Brand DNA.'),
    ).toBeTruthy();
  });
});

describe('BrandSourcesPanel', () => {
  // Connected accounts never ground the analysis, so the panel does not point there.
  test('links to where the documents the DNA is built from are managed', () => {
    render(<BrandSourcesPanel brandBook={book(false)} />);

    expect(screen.getByRole('link', { name: 'Manage documents' }).getAttribute('href')).toContain(
      'section=knowledge',
    );
    expect(screen.queryByRole('link', { name: /connected accounts/i })).toBeNull();
  });
});
