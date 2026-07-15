
# AI-EOS — Phase 1 MVP Plan

The uploaded concept describes a full Executive Operating System spanning 8+ departments, digital twin, learning layer, scenario planning, and more. That is a multi-month build. I'll ship a focused **Phase 1 MVP** that stands on its own and proves the core loop: **data in → PPS priority → constrained recommendations → executive decision**. Later phases add scenarios, digital twin, learning, and more departments.

## Phase 1 Scope

**Core loop the user can actually run end-to-end:**
1. Define products (with V, M, S, L, MOQ, W, BOM basics) and resources (materials, lines, capacity).
2. Enter daily state (stock in/out, line status) in <5 min.
3. Choose a business objective (max profit / max service / reduce inventory / protect cash / default).
4. System computes **PPS** per product using the weighted formula in §7.
5. **Constraint gate** (§8) filters recommendations against materials, capacity, storage, cash.
6. AI (Lovable AI Gateway) generates the executive briefing: *what to do, why, business impact* (§4.4).
7. Executive dashboard: prioritized action list, alerts, KPIs, decision log.

**Out of Phase 1 (explicit):** three-scenario forecasting, digital twin simulation, learning layer, marketing/HR/finance modules, multi-tenant orgs, real ERP integrations.

## Deliverables

### Foundation
- Enable Lovable Cloud (Postgres + Auth + AI Gateway).
- Bilingual AR/EN with RTL/LTR toggle (persistent per user). Arabic is default.
- Design system: executive/industrial feel — dark navy + amber accent, IBM Plex Sans Arabic + Inter, dense data-forward layout. No purple, no generic SaaS gradients.

### Auth
- Email/password + Google sign-in via Lovable Cloud broker.
- Single-org for MVP. `profiles` table + `user_roles` table (`admin`, `manager`, `operator`) with the security-definer `has_role()` pattern.

### Data model (migrations)
- `products` — name, sku, daily_demand (V), margin (M), stability (S), shelf_life (L), moq, strategic_weight (W), status
- `bom_items` — product_id → material_id, quantity
- `materials` — name, unit, stock_qty, reorder_point, unit_cost
- `production_lines` — name, capacity_per_hour, status (running/setup/idle/broken), quality_factor
- `customers` — name, importance (1-10), value, churn_risk
- `orders` — customer_id, product_id, qty, due_date, status
- `daily_entries` — date, product_id, produced, shipped, received, line_id, notes (the 5-min daily input)
- `objectives` — current business objective + custom weights
- `pps_snapshots` — computed PPS + component breakdown per product per run
- `recommendations` — action, reason, impact_json, status (pending/accepted/rejected), created_at
- `decision_log` — who decided what, when, outcome
- All with RLS + explicit GRANTs.

### Server functions (`createServerFn`)
- `computePPS` — pure server compute per §7 formula, using selected objective weights.
- `runConstraintGate` — evaluates each candidate action against §8 constraint types, returns alternatives.
- `generateBriefing` — Lovable AI (`openai/gpt-5.5`) turns the top ranked + constrained actions into the exec's morning briefing in AR or EN.
- `recordDecision` — persists accept/reject/modify.

### UI (routes)
- `/` — Executive dashboard: KPIs (service level, stock days, cash used %, top bottleneck), today's top 5 prioritized actions, alerts, AI morning briefing.
- `/products`, `/materials`, `/lines`, `/customers`, `/orders` — CRUD tables.
- `/daily` — the 5-minute daily input form (per §4.3).
- `/priorities` — full PPS ranked list with component breakdown and objective selector.
- `/decisions` — decision log & audit trail.
- `/settings` — objective weights, language toggle, roles.

### Seed
- One migration seeds a small demo factory (5 products, 8 materials, 3 lines, 4 customers, 10 orders, 7 days of daily entries) so the dashboard is meaningful on first login.

## Technical notes
- TanStack Start + TanStack Query, `_authenticated` layout gates the whole app; `/auth` is the only public route.
- PPS calc lives fully server-side; UI reads snapshots via `useSuspenseQuery`.
- Constraint gate is deterministic TypeScript, not AI — AI is only for the natural-language briefing and root-cause phrasing.
- i18n: lightweight in-repo dictionary (`src/i18n/ar.ts`, `src/i18n/en.ts`) + `dir` attribute swap on `<html>`. No i18n library needed for MVP.

## Roadmap after Phase 1
- Phase 2: three-scenario planning (optimistic/likely/pessimistic) + what-if simulation.
- Phase 3: digital twin (live entity state machines) + real-time alerts.
- Phase 4: learning layer (weight auto-tuning from decision outcomes).
- Phase 5: HR, Finance, Maintenance, Marketing modules.

## What I need from you to start
Confirm Phase 1 scope above, or tell me to trim/expand. On confirm I'll:
1. Enable Lovable Cloud.
2. Ship migrations + auth + design system + `/` + `/daily` + `/priorities` in the first pass, then layer the rest.

Reply "go" (or with edits) and I'll start building.
