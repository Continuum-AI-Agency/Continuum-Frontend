// The campaigns view's split: the chart pane and the campaign rail, resizable, the rail
// collapsible. CampaignAdSetWorkspace spreads these onto its ResizablePanelGroup and panels.
//
// react-resizable-panels 4 reads a NUMBER as pixels and a string as a percentage. The split was
// written as `defaultSize={75}` / `{25}`, which painted a 75px chart and a 25px rail until
// hydration measured the group and re-laid it 75 / 25 percent: the chart and the rail jumped
// 800px sideways, the Dashboard's whole 0.19–0.53 layout shift. `defaultLayout` is what the
// panels paint before the group has measured anything — a flex-grow per panel id, the same style
// the measured layout writes — so the first paint is already the final split.

const CHART_PANEL_ID = 'paid-campaigns-chart';
const RAIL_PANEL_ID = 'paid-campaigns-rail';

export const campaignsSplit = {
  group: {
    orientation: 'horizontal',
    defaultLayout: { [CHART_PANEL_ID]: 75, [RAIL_PANEL_ID]: 25 },
  },
  chart: { id: CHART_PANEL_ID, minSize: '55%' },
  rail: { id: RAIL_PANEL_ID, minSize: '14%', collapsible: true, collapsedSize: 0 },
} as const;
