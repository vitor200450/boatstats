# Public League Slugs - Design

## Understanding Summary

- Implement slugs only for public league pages in this MVP.
- Canonical URL pattern is `/leagues/{slug}`.
- Existing legacy links using league ID must redirect to canonical slug URLs.
- Slugs are generated automatically from league name with collision suffixes.
- Slugs stay stable after league rename.
- Non-goals for this MVP: admin URL migration, season/race/team slugs, alias history.

## Assumptions

- `League.slug` is unique globally.
- Public traffic is low volume with target p95 <= 2s.
- Slugs are public-safe and do not expose sensitive data.
- Dashboard/admin team owns slug maintenance rules.

## Decision Log

| Decision | Alternatives | Why |
|---|---|---|
| Scope only public league pages | Include admin and other entities now | Lower risk and faster delivery |
| Canonical route uses slug only | Hybrid slug+id route | Cleaner URL and canonicalization |
| Auto suffix for collisions | Block duplicate names | Better UX and less friction |
| Redirect legacy id links | Keep dual access forever | Preserve compatibility with canonical URLs |
| Slug remains stable on rename | Regenerate slug on rename | Prevent link churn |
| Use incremental rollout | Big-bang route refactor | Safer migration and easier rollback |

## Final Design

1. Add `League.slug` to Prisma schema and migrate existing rows with deterministic slug backfill.
2. Keep public route file in place, but resolve `params.id` as:
   - first by `slug`;
   - fallback by legacy `id` with permanent redirect to slug URL;
   - `404` if neither is found.
3. Update public links (`home`, `leagues index`, `league details`, `race details`) to emit slug URLs.
4. Generate slug in `createLeague` server action using shared slug utility and unique retry handling.
