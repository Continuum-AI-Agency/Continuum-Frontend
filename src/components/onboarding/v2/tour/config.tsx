import type { Tour } from "nextstepjs";

export const TOUR_DASHBOARD = "walkthrough-dashboard";
export const TOUR_AI_CANVAS = "walkthrough-ai-canvas";
export const TOUR_ORGANIC = "walkthrough-organic";
export const TOUR_PAID_MEDIA = "walkthrough-paid-media";

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
      icon: "🏠",
      title: "Your dashboard",
      content: paragraph(
        "This is home base — a live read on how your brand is performing across organic and paid, in one place."
      ),
      selector: "[data-tour-id='dashboard-overview']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📊",
      title: "Organic metrics",
      content: paragraph(
        "Reach, engagement, and follower growth from your connected social accounts — updated automatically."
      ),
      selector: "[data-tour-id='dashboard-organic-metrics']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🔀",
      title: "Pick an account",
      content: paragraph(
        "Switch the account selector to focus the metrics on any connected profile."
      ),
      selector: "[data-tour-id='dashboard-account-selector']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "✨",
      title: "Trends to act on",
      content: paragraph(
        "We surface trends relevant to your brand. Click any trend to spin up a campaign that inherits your brand DNA."
      ),
      selector: "[data-tour-id='brand-trends']",
      side: "left",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "💰",
      title: "Switch to Paid",
      content: paragraph(
        "Flip to the Paid view to see ad performance and automated optimizations alongside your organic numbers."
      ),
      selector: "[data-tour-id='dashboard-paid-toggle']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📈",
      title: "Paid metrics",
      content: paragraph(
        "Spend, ROAS, and efficiency across your ad accounts — the same at-a-glance read, for paid."
      ),
      selector: "[data-tour-id='dashboard-paid-metrics']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🪙",
      title: "Budget pacing",
      content: paragraph(
        "Budget Pace shows spend against target so you catch under- or over-pacing before it costs you."
      ),
      selector: "[data-tour-id='dashboard-budget-pacing']",
      side: "top",
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
        "Compose images, video, and copy as connected blocks. We dropped in a starter flow so you can see how it fits together."
      ),
      selector: "[data-tour-id='studio-canvas']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🖼️",
      title: "Start with a reference",
      content: paragraph(
        "Drop in a reference image to anchor the look. Anything generated downstream stays on-brand against it."
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
      icon: "🗂️",
      title: "Your organic workspace",
      content: paragraph(
        "Everything for social lives behind these three tabs — Planner, Metrics, and Agent. We'll walk each one."
      ),
      selector: "[data-tour-id='organic-tabs']",
      side: "bottom",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📊",
      title: "Track what's working",
      content: paragraph(
        "Metrics shows reach, engagement, and your top posts across every connected platform — no spreadsheets."
      ),
      selector: "[data-tour-id='organic-metrics-dashboard']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🗓️",
      title: "Plan on one calendar",
      content: paragraph(
        "Schedule and move posts across every channel from a single calendar. Drag to reschedule, click to refine."
      ),
      selector: "[data-tour-id='organic-calendar']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "📝",
      title: "Drafts land here",
      content: paragraph(
        "New and AI-generated drafts collect in this panel. Edit, approve, and schedule them straight onto the calendar."
      ),
      selector: "[data-tour-id='organic-draft-preview']",
      side: "right",
      showControls: true,
      showSkip: true,
    },
    {
      icon: "🤖",
      title: "Let the agent help",
      content: paragraph(
        "Ask the Organic agent to draft posts from trends, your brand DNA, and what's performing — then send them to Planner."
      ),
      selector: "[data-tour-id='organic-agent-panel']",
      side: "left",
      showControls: true,
      showSkip: true,
    },
  ],
};

export const paidMediaTour: Tour = {
  tour: TOUR_PAID_MEDIA,
  steps: [
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
      selector: "[data-tour-id='paid-jaina-chat']",
      side: "top",
      showControls: true,
      showSkip: true,
    },
  ],
};

export const allTours: Tour[] = [dashboardTour, aiCanvasTour, organicTour, paidMediaTour];
