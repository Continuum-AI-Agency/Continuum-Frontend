import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { render } from '@/i18n/__tests__/render';
import {
  ALEIRA_ADS,
  CAMPAIGN,
  PORTFOLIOS,
  ROSTERS,
  TOP_ADSETS,
  TOP_CAMPAIGNS,
} from './__fixtures__/easyFitMeta';
import { type MetaRankRow, rankRowOf } from './metaLensModel';
import type { MetaReadState } from './metaReads';
import { StructureView } from './StructureMap';
import { buildStructure } from './structureModel';

afterEach(cleanup);

const model = buildStructure({
  campaigns: TOP_CAMPAIGNS.map(rankRowOf),
  adsets: TOP_ADSETS.map(rankRowOf),
  portfolios: PORTFOLIOS,
  rosters: new Map(Object.entries(ROSTERS)),
  rootName: 'Easy Fit',
});
if (!model) throw new Error('expected a structure');
const structure = model;

const IDLE: MetaReadState<MetaRankRow[]> = { status: 'no-account' };
const ALEIRA_ADS_READY: MetaReadState<MetaRankRow[]> = {
  status: 'ready',
  data: ALEIRA_ADS.map(rankRowOf),
};

function Zoomable() {
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  return (
    <StructureView
      ads={zoomedId ? ALEIRA_ADS_READY : IDLE}
      currency="MXN"
      model={structure}
      onZoom={setZoomedId}
      size="l"
      zoomedId={zoomedId}
    />
  );
}

/** An accessible name is read with its whitespace collapsed; the stored names keep theirs. */
const spaced = (text: string) => text.replace(/\s+/g, ' ');

const nodes = (level?: string) =>
  screen
    .getAllByTestId('board-module-structure-node')
    .filter((node) => !level || node.getAttribute('data-level') === level);

describe('StructureView at l (Easy Fit, Oct 3 – Nov 2)', () => {
  it('draws the account, its campaigns and their ad sets, the lost ones hatched', () => {
    render(<Zoomable />);
    expect(nodes('root')).toHaveLength(1);
    expect(nodes('campaign')).toHaveLength(10);
    const lost = nodes().filter((node) => node.getAttribute('data-lost') === 'true');
    expect(lost.map((node) => node.getAttribute('aria-label'))).toEqual([
      'EASY/BROAD/OCTUBRE',
      'CONJUNTO GEO',
    ]);
    expect(screen.getByTestId('board-module-structure-lost').textContent).toBe(
      '3 ad sets of Tours Programados - Octubre lost on Oct 15 · EASY /BAU/ OCTUBRE had no spend in 30 days',
    );
    expect(screen.getByTestId('board-module-structure-takeaway').textContent).toBe(
      'Los portafolios manejan el 80% del gasto de 30 días; 3 conjuntos de Tours Programados - Octubre se perdieron el 15 oct.',
    );
  });

  it('zooms a campaign on click: its ad sets below it, their ads last, and back', () => {
    render(<Zoomable />);
    fireEvent.click(
      screen.getByRole('button', {
        name: spaced(`Zoom into ${CAMPAIGN.aleira.name}`),
      }),
    );
    const path = screen.getByRole('navigation', { name: 'Structure path' });
    expect(path.textContent).toBe(`Easy Fit${CAMPAIGN.aleira.name}`);
    expect(nodes('ad')).toHaveLength(10);
    const back = screen.getByRole('button', {
      name: spaced(`Back to every campaign from ${CAMPAIGN.aleira.name}`),
    });
    fireEvent.click(back);
    expect(screen.queryByRole('navigation', { name: 'Structure path' })).toBeNull();
  });

  it('colors by portfolio on the toggle, with each portfolio in the legend', () => {
    render(<Zoomable />);
    fireEvent.click(screen.getByRole('button', { name: 'By portfolio' }));
    const legend = screen.getByText('In no portfolio').parentElement?.textContent;
    expect(legend).toContain('Conversaciones Whatsapp');
    expect(legend).toContain('Tours Programados - Octubre');
    expect(legend).not.toContain('Leads // Google Ads only');
  });
});

describe('StructureView at s', () => {
  it('leads with the share of spend a portfolio optimizes', () => {
    render(
      <StructureView
        ads={IDLE}
        currency="MXN"
        model={structure}
        onZoom={() => undefined}
        size="s"
        zoomedId={null}
      />,
    );
    expect(screen.getByTestId('board-module-structure-headline').textContent).toBe(
      '80%of the spend is in ad sets a portfolio optimizes',
    );
    expect(screen.getByTestId('board-module-structure-lost').textContent).toBe(
      '3 ad sets of Tours Programados - Octubre lost on Oct 15',
    );
    expect(screen.queryAllByTestId('board-module-structure-node')).toHaveLength(0);
  });
});
