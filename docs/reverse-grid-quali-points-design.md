# Reverse Grid Quali Points Design

## Understanding Summary

- Build an optional `Reverse Grid Quali Points` feature for seasons.
- Purpose: award extra points from qualifying when a race uses reverse grid, while keeping normal race points by finishing position.
- Target users: league admins configuring seasons/races and drivers viewing standings.
- Scope: season-level rule configuration + race-level activation flag, with deterministic behavior in import and recalculation flows.
- Qualifying source rule: in races with multiple qualifying rounds (Q1/Q2/Q3), use the most recent qualifying round only.
- Missing/invalid qualifying result in the most recent round (DNS/DSQ/absent) yields `0` reverse-grid points for that driver.
- Non-goals for this phase: no broad retroactive automation for old seasons, no advanced/new round types, no unrelated public ranking redesign.

## Assumptions

- Reverse-grid configuration is stored at season level and activated per race via explicit flag.
- Race-level activation follows sprint-like operational behavior (simple toggle in race configuration context).
- Reverse-grid points table can have fewer positions than normal points table; positions not listed score `0`.
- Current permission model remains unchanged (`SUPER_ADMIN`, owner, league admins).
- No new sensitive data classes are introduced.
- Recalculation remains explicit (admin-triggered) instead of automatic on each config mutation.
- Performance target follows current SaaS baseline expectations (admin pages responsive, recalculation acceptable within existing operational window).

## Decision Log

1. **Decision:** Feature is optional at season level.
   - Alternatives considered: always-on globally.
   - Why chosen: preserves league flexibility and avoids forcing reverse-grid logic on all championships.

2. **Decision:** Reverse grid applies only to races explicitly marked with a race flag.
   - Alternatives considered: apply to all races by default; season default with race exceptions.
   - Why chosen: closest to current admin workflow and least surprising behavior.

3. **Decision:** Source of reverse-grid points is the most recent qualifying round for that race.
   - Alternatives considered: best result among qualifying rounds; sum of all qualifying rounds.
   - Why chosen: matches user rulebook intent (e.g., Q3 defines the reverse-grid qualifying outcome).

4. **Decision:** Driver without valid result in the most recent qualifying round receives `0` reverse-grid points.
   - Alternatives considered: fallback to earlier qualifying round; admin-selectable fallback policy.
   - Why chosen: deterministic, simpler to reason about, avoids hidden fallback logic.

5. **Decision:** Implement Option 1 architecture (season config + race flag).
   - Alternatives considered: round-level `specialType` reuse; hybrid with per-race override source.
   - Why chosen: clear model boundaries, lower ambiguity, strong maintainability with YAGNI.

## Final Design

### 1) Domain and Data Model

- **Season configuration** (`pointsSystem.rules` extension or equivalent validated shape):
  - `reverseGridEnabled: boolean`
  - `reverseGridPointsTable: Record<string, number>`
- **Race configuration**:
  - `reverseGridEnabled: boolean` (default `false`)

Validation constraints:
- `reverseGridPointsTable` keys must represent integer positions `>= 1`.
- Values must be integer points `>= 0`.
- If season reverse-grid is enabled, table must be non-empty and valid.

### 2) Scoring Behavior

For each race during import/recalculation:

1. Compute normal points using existing round/race logic.
2. If season and race reverse-grid are both enabled:
   - Identify qualifying rounds for that race.
   - Select the most recent qualifying round.
   - For each driver:
     - If valid result exists in selected round, award points from `reverseGridPointsTable[position]`.
     - Otherwise award `0`.
3. Final per-driver contribution for standings = `normalPoints + reverseGridQualiPoints`.

### 3) Multiple Qualifying Rounds

- Round order must deterministically identify the latest qualifying round.
- Only that latest round contributes reverse-grid points.
- Earlier rounds are ignored for reverse-grid scoring (even if they contain valid results).

### 4) Edge Cases

- Race marked reverse-grid but no qualifying round imported: all drivers receive `0` reverse-grid points; flow does not fail.
- DSQ in latest qualifying round: `0` reverse-grid points.
- Position outside configured points table: `0` reverse-grid points.
- Tied/duplicate positions follow current data model assumptions from imported round results.

### 5) Admin UX Behavior

- **Season page/settings:**
  - Toggle for enabling reverse-grid feature.
  - Editable points table for reverse-grid qualifying points.
- **Race details/configuration:**
  - Toggle `reverseGridEnabled` for that race.
  - Toggle visible/active only when season reverse-grid is enabled.

### 6) Reliability and Performance

- Keep calculations deterministic between import and recalculation.
- Avoid N² loops by pre-indexing qualifying results by race/driver when possible.
- Preserve existing transaction boundaries for scoring writes.
- Revalidation strategy should remain scoped to impacted race/season/standings pages.

### 7) Security and Ownership

- Reuse existing access control checks; no new role model required.
- No new PII or secrets handling required.

### 8) Testing Strategy

Minimum coverage:

- Unit tests:
  - awards correct reverse-grid points from latest qualifying round.
  - ignores earlier qualifying rounds when latest exists.
  - gives `0` for missing/DSQ/absent result in latest qualifying round.
  - gives `0` for positions outside reverse-grid table.
- Integration tests:
  - import and explicit recalculation produce identical final standings totals.
  - races without reverse-grid flag remain unchanged.
  - season with feature disabled never applies reverse-grid points.

### 9) Risks and Mitigations

- **Risk:** ambiguous round ordering can pick wrong qualifying source.
  - **Mitigation:** define and document deterministic ordering rule used by importer/configuration.
- **Risk:** admin misconfiguration of points table.
  - **Mitigation:** strict schema validation with clear Portuguese validation errors.
- **Risk:** recalculation latency growth in large seasons.
  - **Mitigation:** reuse indexed datasets and keep reverse-grid pass linear to result count.
