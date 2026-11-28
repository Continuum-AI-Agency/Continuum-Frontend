# Third-party source notices

## Brigade

Repository: https://github.com/gmpetrov/brigade

Pinned revision: `c5100df20b3a7ef335dac03ccc6745e5caba4274`

Copied and adapted source:

- `apps/web/lib/inbox.ts`, blob `801b4663835772c88a2803120d0d0ed82cd337a3`, filter restoration helper → `src/components/watchman/dashboard/inboxFilters.ts`. Adaptations: brand-scoped preference key, Watchman role/status filters, explicit conversation links take priority. No data, authority or credentials are stored.
- `packages/contracts/src/thread-history.ts`, blob `5e76377413927d2c0c607b3d5943e5077593e5ba`, timeline grouping helper → `src/components/watchman/work/timeline.ts`. Adaptations: local type/style, presentation-only grouping of persisted conversation messages. No upstream event storage or execution engine is imported.

The selected helpers have no runtime imports or embedded assets. Their containing file/package and repository notices were checked at the pinned revision; the applicable root license is reproduced below. This entry covers these selected copied helpers, not adoption of Brigade's platform or dependencies.

MIT License

Copyright (c) 2026 Georges Petrov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
