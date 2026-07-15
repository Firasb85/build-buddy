# AI-EOS Gap Analysis & Roadmap

> Comparing `AI_EOS_Full_Concept_v4.md` (concept) against the current implementation in `build-buddy/`.
> Generated: 2026-07-15

## Summary

The current `build-buddy/` codebase is a **working Phase 1 (MVP) implementation** of the AI-EOS concept.
It implements the digital twin (schema), the PPS engine, basic constraint gating, the
executive dashboard, daily entry, decision log, and an AI briefing endpoint.

This document identifies which concept sections are **covered**, **partial**, or **missing**,
and proposes a prioritized build plan for the next iteration.

---

## Coverage Matrix

| Concept section | Status | Where it lives today |
|---|---|---|
| §1 Executive summary | ✅ Implemented | `routes/index.tsx` (landing) |
| §2 Problem framing | ✅ Reflected in product copy | `dict.ts` (hero copy) |
| §3 Vision & values | ✅ Implemented | landing + dashboard framing |
| §4 Founding principles | ✅ Reflected in design | 5-min daily entry, executive briefing |
| §5 Factory as flow system | ✅ Implemented | DB schema + factory page |
| §6 Core entities (Product, Resource, State, Event) | ✅ Implemented | `materials`, `products`, `production_lines`, `customers`, `orders`, `daily_entries`, `bom_items` |
| §7 PPS engine | ✅ Implemented | `lib/pps.server.ts` (pure logic) + `lib/pps.functions.ts` (DB I/O) |
| §7.4 Weight tables (5 objectives) | ✅ Implemented | `WEIGHTS` constant in `pps.server.ts` |
| §7.5 Worked example | ⚠️ Partial | Numbers exist in engine but no in-UI walkthrough |
| §8 Constraint layer (Reality Gate) | ⚠️ Partial | Material readiness + line status + stockout; **missing**: cash, warehouse, quality, time |
| §9.1 AI Planner | ⚠️ Partial | Embedded in `runPPS`; no multi-week planning horizon |
| §9.2 AI Monitor | ❌ Missing | No data-freshness tracker, no department completion % |
| §9.3 AI Detect (anomaly + root cause) | ❌ Missing | No anomaly detection; no root-cause analysis |
| §9.4 AI Forecast (3 scenarios) | ❌ Missing | No forecast engine at all |
| §9.5 AI Recommendation (alternatives) | ⚠️ Partial | Single top-5 list; **missing**: alternatives with cost/impact, risks, mitigation |
| §9.6 Executive Assistant (NL chat) | ⚠️ Partial | One-shot briefing endpoint; **no conversational chat** |
| §10 Learning layer | ❌ Missing | No weekly review, no weight auto-tuning |
| §11 Digital Twin | ✅ Implemented (DB layer) | `pps_snapshots` + live entity tables |
| §12.1 Daily cycle | ✅ Implemented | `runPPS` + dashboard top-of-day card |
| §12.2 Weekly cycle | ❌ Missing | No weekly review screen |
| §12.3 Monthly cycle (planning) | ❌ Missing | No planning horizon / scenario comparison |
| §13.1 Planning Center | ⚠️ Partial | `priorities.tsx` (objective selector + ranked table) — no multi-scenario |
| §13.2 Execution Center | ✅ Implemented | `daily.tsx` |
| §13.3 Intelligence & Reporting | ⚠️ Partial | `dashboard.tsx` (KPIs + briefing); no drill-down reports |
| §14 Departments (8) | ✅ Schema-only | All tables present; no per-department dashboards |
| §15.1 Smart planning | ⚠️ Partial | Daily only |
| §15.2 Cross-department coordination | ⚠️ Partial | PPS cross-cuts, but no explicit conflicts view |
| §15.3 Prevent overproduction | ❌ Missing | No overstock / dead-stock detection |
| §15.4 Prevent underproduction | ⚠️ Partial | Stockout risk exists; no "time to act" countdown |
| §15.5 Smart purchasing | ❌ Missing | No reorder suggestions, no supplier comparison |
| §15.6 Smart inventory (turnover) | ❌ Missing | No dead-stock, no turnover ratio |
| §15.7 Problem detection | ❌ Missing | No structured alerts |
| §15.8 Forecasts | ❌ Missing | No forecast module |
| §15.9 Smart recommendations | ⚠️ Partial | See §9.5 |
| §15.10 Scenario simulation | ❌ Missing | No what-if engine |
| §16 Executive Dashboard | ⚠️ Partial | `dashboard.tsx` covers KPIs + actions + briefing; missing: AI agent cards, scenario cards, overall status color, decision queue |
| §17 Tech architecture | ✅ Implemented | React 19 + TanStack Start + Supabase + Tailwind 4 |
| §18 Design principles | ✅ Reflected | Small inputs, executive tone, bilingual |
| §19 Roadmap (4 phases) | — | This update targets Phase 2 (smart) features |
| §20 Usage scenarios | ⚠️ Partial | Realized through current UI, not as guided flows |
| §21 Comparison vs ERP/BI/MES | — | Marketing copy |
| §22 Final definition | ✅ Reflected in copy | landing page |

**Coverage**: ~55% of concept features are fully or substantially implemented.
The other ~45% belongs to the "AI layer" (Detect, Forecast, Learn, Simulate) and
"smart operations" (purchasing, inventory, alerts) — these are the focus of this update.

---

## Proposed Update — Phase 2 (this build)

### Goal
Add the **intelligence + learning** modules that turn the existing engine into a true
"Executive Operating System": forecasts, simulation, anomaly detection, conversational
assistant, weekly learning, and operational alerts.

### Scope (6 modules)

| # | Module | New files | Concept coverage |
|---|---|---|---|
| 1 | **AI Forecast** (3-scenario, 7d/4w/3m) | `lib/forecast.server.ts`, `lib/forecast.functions.ts`, `routes/_authenticated/forecast.tsx`, migration | §9.4, §15.8, §20.3 |
| 2 | **What-If Simulator** | `lib/simulate.server.ts`, `lib/simulate.functions.ts`, `routes/_authenticated/simulate.tsx` | §9.5 (alt), §15.10, §20.1 |
| 3 | **Executive Assistant chat** (NL) | `lib/assistant.server.ts`, `lib/assistant.functions.ts`, `routes/_authenticated/assistant.tsx` | §9.6, §20.1 |
| 4 | **Anomaly Detection & Alerts** | `lib/anomaly.server.ts`, alerts panel on dashboard | §9.2, §9.3, §15.7 |
| 5 | **Learning layer** (weekly review + weight tuner) | `lib/learning.server.ts`, `routes/_authenticated/learning.tsx`, auto-tune in `runPPS` | §10, §12.2 |
| 6 | **Overstock & dead-stock detection** | additions to `pps.server.ts` + dashboard widget | §15.3, §15.6 |

### Cross-cutting
- **i18n**: ~80 new keys added to `dict.ts` (AR + EN)
- **Nav**: 4 new nav items (`forecast`, `simulate`, `assistant`, `learning`)
- **Dashboard**: Add alerts panel, overall health color, AI-agent cards
- **DB migration**: New tables — `forecast_runs`, `learning_signals`, `alert_states`
- **Verify**: `tsc --noEmit` after each module to catch type errors early

### Out of scope (deferred to Phase 3+)
- §9.2 AI Monitor (data freshness, dept completion %) — needs richer data
- §12.3 Monthly planning cycle UI (multi-week horizon)
- §13.1 Multi-scenario planning comparison
- §15.5 Smart purchasing (supplier comparison, auto-reorder)
- §15.6 Inventory turnover ratio dashboards
- §14 Per-department dashboards (8)
- §13.3 Drill-down reports

### Acceptance criteria
- All 6 modules are reachable from the sidebar
- All new text appears in both AR and EN
- `bunx tsc --noEmit` passes
- Existing dashboard/priorities/decision flow still works

---

*Generated by the AI-EOS gap analysis routine.*
