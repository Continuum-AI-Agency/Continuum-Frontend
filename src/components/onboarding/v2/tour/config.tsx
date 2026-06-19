import type { Tour } from "nextstepjs";

export const TOUR_DASHBOARD = "walkthrough-dashboard";
export const TOUR_AI_CANVAS = "walkthrough-ai-canvas";
export const TOUR_ORGANIC = "walkthrough-organic";
export const TOUR_PAID_MEDIA = "walkthrough-paid-media";
export const ORGANIC_PLANNER_TOUR_VIEWPORT_ID = "organic-planner-tour-viewport";

export type TourName =
  | typeof TOUR_DASHBOARD
  | typeof TOUR_AI_CANVAS
  | typeof TOUR_ORGANIC
  | typeof TOUR_PAID_MEDIA;

export const TOUR_NAMES: readonly TourName[] = [
  TOUR_DASHBOARD,
  TOUR_AI_CANVAS,
  TOUR_ORGANIC,
  TOUR_PAID_MEDIA,
];

export function seenFlagBase(tour: TourName): string {
  return `walkthrough-seen:${tour}`;
}

function paragraph(text: string) {
  return <p className="text-sm leading-relaxed text-[#0b1220]">{text}</p>;
}

export const dashboardTour: Tour = {
  tour: TOUR_DASHBOARD,
  steps: [
    {
      icon: "✨",
      title: "Your insights & top content",
      content: paragraph(
        "Your account's performance insights, beside your best-performing posts. Sort any column, right-click a row to act on it, or click to expand."
      ),
      selector: "[data-tour-id='dashboard-top-content']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "💰",
      title: "Now your paid side",
      content: paragraph(
        "Flip to Paid for your top-performing ads — the same ranked, sortable tables."
      ),
      selector: "[data-tour-id='dashboard-paid-toggle']",
      side: "bottom-right",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📈",
      title: "Top ads by ROAS",
      content: paragraph(
        "Your top campaigns and ad sets, ranked. Click any row for the spend, CPC, and conversion detail."
      ),
      selector: "[data-tour-id='dashboard-top-ads']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
  ],
};

export const aiCanvasTour: Tour = {
  tour: TOUR_AI_CANVAS,
  steps: [
    {
      icon: "🎨",
      title: "This is your canvas",
      content: paragraph(
        "Compose images, video, and copy as connected blocks. We dropped in a starter flow below so you can see how it fits together."
      ),
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🖼️",
      title: "Start with a reference image",
      content: paragraph(
        "Drop an image here to anchor the look. Right-click anywhere on the canvas to add more nodes like this one whenever you need them."
      ),
      selector: "[data-tour-id='studio-node-reference-image']",
      side: "right",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "✍️",
      title: "Describe what you want",
      content: paragraph(
        "The prompt block is your direction. Your brand voice is already loaded — just say what to make."
      ),
      selector: "[data-tour-id='studio-node-prompt']",
      side: "right",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "✨",
      title: "Wire them into a generator",
      content: paragraph(
        "Connect the reference image and the prompt into the image generator. Inputs flow along the edges into the block."
      ),
      selector: "[data-tour-id='studio-node-image-gen']",
      side: "left",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "▶️",
      title: "Run the flow",
      content: paragraph(
        "Hit Run Flow to execute every connected block. Your first on-brand image lands right in the generator."
      ),
      selector: "[data-tour-id='studio-run-flow']",
      side: "bottom-right",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🤝",
      title: "And all of this is Multiplayer!",
      content: paragraph(
        "See teammates online here and switch between shared workspaces. Cursors and edits sync live — collaborate on the same flow at the same time."
      ),
      selector: "[data-tour-id='studio-multiplayer']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
  ],
};

export const organicTour: Tour = {
  tour: TOUR_ORGANIC,
  steps: [
    {
      icon: "🗓️",
      title: "Plan on one calendar",
      content: paragraph(
        "Schedule and move posts across every channel from a single calendar. Drag to reschedule, click to refine."
      ),
      selector: "[data-tour-id='organic-calendar-controls']",
      side: "bottom",
      viewportID: ORGANIC_PLANNER_TOUR_VIEWPORT_ID,
      pointerPadding: 8,
      pointerRadius: 10,
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📋",
      title: "Or switch to the list view",
      content: paragraph(
        "Click List to see every post as a flat, sortable list instead of a calendar grid."
      ),
      selector: "[data-tour-id='organic-list-view']",
      side: "bottom",
      viewportID: ORGANIC_PLANNER_TOUR_VIEWPORT_ID,
      pointerPadding: 8,
      pointerRadius: 10,
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📝",
      title: "Drafts, scheduled, and posted",
      content: paragraph(
        "The list groups everything by status — backlog, drafts, scheduled, and published — so you can sweep through each pile in order."
      ),
      selector: "[data-tour-id='organic-list-content']",
      side: "top",
      viewportID: ORGANIC_PLANNER_TOUR_VIEWPORT_ID,
      pointerPadding: 8,
      pointerRadius: 10,
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📊",
      title: "Jump to Metrics",
      content: paragraph(
        "Click Metrics to see reach, engagement, and top posts across every connected platform."
      ),
      selector: "[data-tour-id='organic-metrics-tab']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📈",
      title: "Track what's working",
      content: paragraph(
        "Metrics shows performance side-by-side across platforms — no spreadsheets, updated automatically."
      ),
      selector: "[data-tour-id='organic-metrics-dashboard']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🤖",
      title: "Let the agent help",
      content: paragraph(
        "Ask the Organic agent to draft posts from trends, your brand DNA, and what's performing — then send them straight to the Planner."
      ),
      selector: "[data-tour-id='organic-agent-tab']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
  ],
};

export const paidMediaTour: Tour = {
  tour: TOUR_PAID_MEDIA,
  steps: [
    {
      icon: "🏦",
      title: "Pick an ad account",
      content: paragraph(
        "Switch ad accounts here. Everything below — metrics, insights, alerts — refocuses on whichever account you select."
      ),
      selector: "[data-tour-id='paid-account-selector']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🎯",
      title: "Filter and pick campaigns",
      content: paragraph(
        "Narrow the rail to All, Indexes, or Campaigns, then select the ones you want to compare and chart."
      ),
      selector: "[data-tour-id='paid-campaign-selector']",
      side: "right",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📈",
      title: "Performance at a glance",
      content: paragraph(
        "These metric cards summarize spend, results, and efficiency. Click any card to chart that metric in full."
      ),
      selector: "[data-tour-id='paid-metric-cards']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🕯️",
      title: "The full chart",
      content: paragraph(
        "The chart plots the metric you picked over time, so you can spot trends and turning points fast."
      ),
      selector: "[data-tour-id='paid-performance-chart']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "💡",
      title: "Insights, not just numbers",
      content: paragraph(
        "Insight cards call out placements, audiences, creative, and budget pacing that need your attention."
      ),
      selector: "[data-tour-id='paid-insights-panel']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🔍",
      title: "Drill into ad sets",
      content: paragraph(
        "Switch to Ad Sets to see performance one level deeper — compare ad sets and expand into individual ads."
      ),
      selector: "[data-tour-id='paid-adset-toggle']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🔔",
      title: "DCO actions log",
      content: paragraph(
        "Open the alerts here to see every automated optimization — creative swaps, budget shifts, and more."
      ),
      selector: "[data-tour-id='paid-dco-alerts']",
      side: "left",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🧠",
      title: "Ask Jaina",
      content: paragraph(
        "Jaina is your paid-media analyst. Prompt her for reports, diagnostics, and recommendations in plain language."
      ),
      selector: "[data-tour-id='paid-jaina-tab']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
  ],
};

export const allTours: Tour[] = [dashboardTour, aiCanvasTour, organicTour, paidMediaTour];
