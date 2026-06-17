# Paid-Media Budget Optimizer — diagrams

Self-contained HTML diagrams documenting the optimizer feature
(`packages/optimization-engine` + the `/paid-media/optimizer` screens). Open either
file directly in a browser — no build step or dependencies.

| File | What it shows |
|---|---|
| [`system-diagram.html`](./system-diagram.html) | Full conceptual architecture: ingestion → objective profiles → the five-stage engine pipeline (Pacing → Classify → Triggers → Reallocate → Mode) → config precedence → EWMA loop → frontend/API → invariants → package topology. |
| [`frontend-mockup.html`](./frontend-mockup.html) | Interactive reproduction of the six optimizer screens (Overview, Portfolios, Actions, Dashboard, Reallocation, Settings), styled to the app's tokens and populated with real engine output over the sample portfolios. Click the tabs to switch screens. |

Notes:
- The mockup is a static visual reference (tabs switch; inputs/sliders are illustrative);
  per-ad-set IDs in Settings are representative.
- Numbers come from running `runPortfolioCycle` over `SAMPLE_PORTFOLIOS`, so they match the
  engine's actual allocations, conservation, and pause recommendations at time of writing.
