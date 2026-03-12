# Public Tracks Pages - Design Document

## Understanding Summary

- Build a public Tracks experience with **catalog + dedicated track detail page**.
- Purpose: make Frosthex track data easier to discover and inspect (record + top 10).
- Audience: public users of the dashboard browsing track records.
- Canonical track route key: `commandName` (`/tracks/[commandName]`).
- MVP detail content: current record, top 10 leaderboard, contextual navigation.
- API sources: Frosthex `v3 /readonly/tracks` (catalog) and `v2 /readonly/tracks/:trackname` (detail).
- Auth model: server-side `FROSTHEX_API_KEY` only; never exposed to client.

## Assumptions

- `FROSTHEX_API_KEY` is available in runtime environments that render public pages.
- Frosthex `v3` provides enough metadata for listing and linking via `commandName`.
- Frosthex `v2` returns data that can consistently produce record and top 10.
- UI language for MVP remains EN, but copy structure is i18n-ready for future PT-BR.
- Revalidation target for this area is 5 minutes (ISR-style cache behavior).
- If detail fetch fails for a specific track, route should return 404 by design.

## Non-Functional Requirements

| Aspect | Requirement |
|---|---|
| Performance | Target p95 < 1.5s for public track pages |
| Freshness | Revalidation window: 5 minutes |
| Scale | Public-read traffic; no write path in MVP |
| Security | API key server-only; no secret in client bundles |
| Reliability | Graceful catalog unavailable state; detail failure => 404 |
| Ownership | Application team maintains page behavior and external API handling |

## Explicit Non-Goals (MVP)

- Historical evolution of records over time.
- Cross-track comparative analytics/ranking views.
- Advanced SEO (structured data/schema and deep SEO tuning).

## Decision Log

| # | Decision | Alternatives Considered | Why This Option |
|---|---|---|---|
| 1 | Goal is catalog + detail | Catalog only; detail only | Best balance between discovery and depth |
| 2 | Use server-side API key | Public anonymous calls; internal snapshot first | Required due to 401 + safer secret handling |
| 3 | Detail URL key = `commandName` | `id`; slugified `name`; hybrid | Directly matches Frosthex detail endpoint |
| 4 | MVP detail scope = record + top 10 + nav | Rich stats; advanced metadata first | Fast value with low complexity (YAGNI) |
| 5 | Detail fetch failure => 404 | Partial fallback page; global error | Predictable behavior and clean contract |
| 6 | NFR profile = standard recommended | Aggressive; conservative cache profiles | Balanced freshness and load |
| 7 | Language = EN now, i18n-ready | PT-BR now; fully bilingual switch now | Lower MVP scope, keeps future localization easy |
| 8 | Local DB snapshot deferred | Implement snapshot now; no future snapshot path | Avoid premature ops complexity |
| 9 | If snapshot is later needed, refresh every 5 min | 15 min; 30 min | Track records can change frequently |
| 10 | Catalog avoids per-track fan-out to v2 | Enrich catalog with per-track v2 fetch | Major request reduction on Frosthex |
| 11 | Empty detail list is valid ("no records yet") | Treat empty as error | Better UX and semantic correctness |
| 12 | Normalize/validate detail rows defensively | Render raw rows as-is | Avoid UI break on malformed entries |
| 13 | Validate via critical route/data scenarios | Full automated test suite now | No test framework currently configured |
| 14 | Rollout in incremental steps | Big-bang replacement | Lower risk, easier rollback |
| 15 | Snapshot adoption based on measurable triggers | Subjective/manual decision only | Keeps architecture decision objective |

## Final Design

### 1) Route Architecture

- Keep `src/app/(public)/tracks/page.tsx` as catalog route.
- Add dynamic route: `src/app/(public)/tracks/[commandName]/page.tsx`.
- Catalog responsibility: list tracks and link to detail pages.
- Detail responsibility: show current record and top 10 leaderboard.

### 2) Data Flow

- Catalog fetches only `v3 /readonly/tracks`.
- Detail fetches `v2 /readonly/tracks/:trackname` using `commandName`.
- No catalog fan-out to per-track `v2` calls in MVP.
- Apply 5-minute revalidation to reduce external load and keep data fresh.

### 3) Rendering and State Rules

- Catalog:
  - Success: show track cards with navigation to detail.
  - Failure: show explicit unavailable state for list page.
- Detail:
  - Success with entries: show record block + top 10 table/list.
  - Success with no entries: show "no records yet" state.
  - Fetch/shape failure: return 404.

### 4) Data Normalization Rules (Detail)

- Accept only rows with required fields for leaderboard rendering.
- Sort fallback by ascending time if rank is inconsistent.
- Record block uses first valid best result after normalization.
- Invalid rows are dropped silently from top 10 to protect UI integrity.

### 5) i18n-Ready Constraint (EN in MVP)

- Keep EN copy now.
- Centralize page text/constants to avoid hardcoded strings scattered across JSX.
- Do not implement user-facing language switch in MVP.

### 6) Reliability and Observability

- Log server-side fetch failures for `v3` and `v2` separately.
- Track 404 rates on `/tracks/[commandName]` to identify external instability vs invalid routes.
- Monitor p95 response behavior; use this as part of snapshot trigger criteria.

### 7) Future Evolution Trigger (Optional)

Move to local 5-minute snapshot sync when one or more are sustained:

- External API error rate becomes materially high.
- Track pages consistently miss performance target.
- External request volume/cost becomes operationally problematic.

## Open Questions (Resolved for MVP)

- Persist tracks in local DB now? **No**, deferred.
- Snapshot freshness when adopted later? **5 minutes**.
