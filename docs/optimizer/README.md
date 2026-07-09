# Paid-Media Budget Optimizer — diagrams

Documents the optimizer feature (`packages/optimization-engine` + the
`/paid-media/optimizer` screens). The PNGs below render inline on GitHub; the
HTML files are the same diagrams, interactive and self-contained (open in a browser).

> GitHub serves `.html` files as source, not as rendered pages, so use the images
> here to view them on GitHub — or open the `.html` files locally for the live versions.

## System architecture

Ingestion → objective profiles → the five-stage engine pipeline
(Pacing → Classify → Triggers → Reallocate → Mode) → config precedence → EWMA loop →
frontend/API → invariants → package topology.

![Optimizer system diagram](./img/system-diagram.png)

Interactive version: [`system-diagram.html`](./system-diagram.html)

## Frontend (current state)

The six optimizer screens (Overview, Portfolios, Actions, Dashboard, Reallocation,
Settings), styled to the app's tokens and populated with real engine output
(`runPortfolioCycle` over `SAMPLE_PORTFOLIOS`). The interactive version uses tabs;
this image stacks all six screens for a single view.

![Optimizer frontend mockup](./img/frontend-mockup.png)

Interactive version: [`frontend-mockup.html`](./frontend-mockup.html)

---

Notes:
- The mockup is a static visual reference (the interactive HTML has working tabs;
  inputs/sliders are illustrative); per-ad-set IDs in Settings are representative.
- Numbers match the engine's actual allocations, conservation, and pause
  recommendations at time of writing.
