# Manual Final Round Design

## Understanding Summary

- We need to support races where the API provides only qualifying rounds and no final race round.
- In these cases, admins must be able to create a manual final round so the competition can keep valid standings data.
- The manual final round should be initialized from the latest qualifying round order.
- Admins must be able to add extra drivers manually after the initial copy.
- New drivers should be created on-the-fly (same existing behavior used in imports).
- The manual final round must use the default FINAL points rules from the season.
- If a real API final appears later, manual rounds continue to be authoritative unless explicitly changed.

## Scope and Non-Goals

### In scope

- Create manual final rounds from existing qualifying data.
- Edit manual final positions with existing up/down workflow.
- Add additional drivers to manual final rounds.
- Keep manual rounds isolated from API reimport overwrite behavior.
- Mark rounds explicitly as API or MANUAL in data and UI.

### Out of scope

- Automatic merge/reconciliation between API finals and manual finals.
- Full immutable audit trail of every change (basic audit only).
- New advanced sprint orchestration logic.

## Non-Functional Requirements

### Performance

- Small scale target: up to ~30 drivers per race.
- Manual round creation and recalculation should complete in a few seconds in normal conditions.

### Security

- Only `SUPER_ADMIN`, league owner, and league admins can create/edit manual rounds.
- Inputs must be validated with Zod and constrained by round ownership.

### Reliability

- Use transactions for create/copy/update operations.
- Reimport flows must never overwrite `MANUAL` origin rounds.

### Maintenance

- Avoid name-based inference for round origin.
- Use explicit schema fields to distinguish API vs MANUAL rounds.

## Assumptions

- Existing standings pipeline can already consume multiple scoring rounds for a race.
- Existing manual position edit action can be extended to allow manual final rounds.
- Existing UI round table can render additional metadata badges with small changes.

## Chosen Approach

Use **Round Manual First-Class** modeling.

- Store manual rounds directly as `EventRound` records.
- Add explicit metadata for origin and manual type.
- Reuse existing scoring and standings pipeline, with clear filtering rules for imports.

## Data Model Design

Add fields to `EventRound`:

- `origin`: enum `API | MANUAL` (default `API`)
- `manualKind`: enum nullable, initially `FINAL`
- `manualBaseRoundId`: nullable FK/self-reference to source round
- `manualCreatedById`: nullable user id
- `manualCreatedAt`: nullable datetime

Rationale:

- Supports multiple manual rounds per race.
- Keeps source attribution explicit.
- Enables future manual sprint rounds without redesign.

## Server Actions Design

### 1) `createManualFinalRound`

Input:

- `raceId`
- `baseRoundId?` (optional; default = latest qualifying round)

Behavior:

1. Authorize admin/owner/super admin.
2. Resolve base round:
   - If provided, validate it belongs to the race.
   - Else select latest qualifying round.
3. Create new `EventRound` with:
   - `origin=MANUAL`
   - `manualKind=FINAL`
   - `countsForStandings=true`
   - `status=IMPORTED` (with immediately usable results)
4. Copy driver order from base round into new `RoundResult` records.
5. Calculate points using standard FINAL logic.
6. Recalculate standings.

### 2) `addManualRoundDriver`

Input:

- `eventRoundId`
- `uuid`
- `name`

Behavior:

1. Ensure target round is `origin=MANUAL` and `manualKind=FINAL`.
2. Upsert driver by UUID (on-the-fly create/update name).
3. Insert round result at next available position.
4. Recalculate round points and standings.

### 3) Extend existing manual position action

Current action `applyManualFinalRoundPositions` should accept:

- Existing final API rounds (`isRaceRound` true), and
- Manual final rounds (`origin=MANUAL && manualKind=FINAL`).

## Import/Reimport Rules

- API round imports and race imports operate only over `origin=API` rounds.
- `origin=MANUAL` rounds are preserved and never deleted/overwritten by API reimport.
- If API later adds a true final, both can coexist; manual remains valid by default.

## UI/UX Design

In race details page:

- Add action button: `Criar round final manual`.
- Display badge in rounds table: `API` or `MANUAL`.
- For manual final rounds:
  - allow existing position editing controls (up/down + save/cancel),
  - show `Adicionar piloto` form (UUID + nome),
  - show basic audit hint (created at/by where available).

Round naming:

- Auto-generate readable names, e.g. `Manual Final #1`, `Manual Final #2`.

## Error Handling

- No qualifying base available: return clear user-facing error.
- Duplicate driver in round: reject with clear message.
- Invalid round ownership or unauthorized user: reject with `Acesso negado`.
- Migration missing for new fields: return actionable migration message.

## Testing Strategy

### Unit tests

- Create manual final picks latest qualifying round by default.
- Manual final round points match FINAL points system.
- Add driver action creates driver on-the-fly and appends position.
- Reimport API does not mutate manual rounds.

### Integration tests

- Race with only qualy -> create manual final -> standings update correctly.
- Multiple manual finals in one race remain independent and visible.
- Manual edit + save + cancel preserves saved state in UI.

## Risks and Mitigations

- **Risk:** confusion with many final-like rounds.
  - **Mitigation:** explicit `API/MANUAL` badges and clear naming.
- **Risk:** inconsistent fastest lap when source data is incomplete.
  - **Mitigation:** keep existing fallback preservation logic in recalc/import.
- **Risk:** accidental API overwrite.
  - **Mitigation:** strict `origin=API` filtering in import paths.

## Decision Log

1. **Allow manual final rounds when API has no final**
   - Alternatives: edit qualy directly, skip race
   - Chosen: create manual final to preserve race semantics and standings consistency

2. **Use first-class manual rounds in `EventRound`**
   - Alternatives: overlay table, naming convention only
   - Chosen: explicit model is safer and easier to maintain

3. **Initialize from latest qualifying order**
   - Alternatives: empty round, choose any source by default
   - Chosen: fastest operational path with minimal admin effort

4. **Allow adding extra drivers manually**
   - Alternatives: fixed copied roster only
   - Chosen: handles late joiners/missing API participants

5. **On-the-fly driver creation**
   - Alternatives: require pre-existing drivers
   - Chosen: consistent with current import workflow

6. **Manual remains authoritative after future API final appears**
   - Alternatives: auto-replace, prompt every time
   - Chosen: no destructive surprise; explicit admin control

7. **Allow multiple manual finals per race**
   - Alternatives: enforce single manual final
   - Chosen: supports additional stages (e.g., sprint-like workflows)

8. **Basic audit level**
   - Alternatives: full immutable history
   - Chosen: lower complexity, adequate for current needs
