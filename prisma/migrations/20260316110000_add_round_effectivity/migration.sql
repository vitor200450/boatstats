-- Add round-based temporal effectivity for team assignments
ALTER TABLE "SeasonTeamAssignment"
ADD COLUMN "effectiveFromRound" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "effectiveToRound" INTEGER;

-- Backfill assignment effective rounds from existing joinedAt/leftAt timestamps
WITH race_refs AS (
  SELECT
    r."seasonId",
    r."round",
    COALESCE(r."scheduledDate", r."createdAt") AS ref_date
  FROM "Race" r
), assignment_bounds AS (
  SELECT
    a."id",
    COALESCE(
      (
        SELECT MIN(rr."round")
        FROM race_refs rr
        WHERE rr."seasonId" = a."seasonId"
          AND rr.ref_date >= a."joinedAt"
      ),
      1
    ) AS from_round,
    CASE
      WHEN a."leftAt" IS NULL THEN NULL
      ELSE COALESCE(
        (
          SELECT MIN(rr."round") - 1
          FROM race_refs rr
          WHERE rr."seasonId" = a."seasonId"
            AND rr.ref_date >= a."leftAt"
        ),
        (
          SELECT MAX(rr."round")
          FROM race_refs rr
          WHERE rr."seasonId" = a."seasonId"
        )
      )
    END AS to_round
  FROM "SeasonTeamAssignment" a
)
UPDATE "SeasonTeamAssignment" a
SET
  "effectiveFromRound" = ab.from_round,
  "effectiveToRound" = CASE
    WHEN ab.to_round IS NULL THEN NULL
    WHEN ab.to_round < ab.from_round THEN ab.from_round
    ELSE ab.to_round
  END
FROM assignment_bounds ab
WHERE a."id" = ab."id";

CREATE INDEX "SeasonTeamAssignment_seasonId_driverId_effectiveFromRound_idx"
  ON "SeasonTeamAssignment"("seasonId", "driverId", "effectiveFromRound");

CREATE INDEX "SeasonTeamAssignment_seasonId_driverId_effectiveToRound_idx"
  ON "SeasonTeamAssignment"("seasonId", "driverId", "effectiveToRound");

-- Add round-based temporal effectivity for depth chart snapshots
ALTER TABLE "SeasonTeamDepthChartEntry"
ADD COLUMN "effectiveFromRound" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "effectiveToRound" INTEGER;

-- Remove old uniqueness (single static depth chart) to allow temporal snapshots
DROP INDEX IF EXISTS "SeasonTeamDepthChartEntry_seasonId_teamId_driverId_key";
DROP INDEX IF EXISTS "SeasonTeamDepthChartEntry_seasonId_teamId_priority_key";

-- New indexes for temporal reads
CREATE INDEX "SeasonTeamDepthChartEntry_seasonId_teamId_effectiveFromRound_priority_idx"
  ON "SeasonTeamDepthChartEntry"("seasonId", "teamId", "effectiveFromRound", "priority");

CREATE INDEX "SeasonTeamDepthChartEntry_seasonId_teamId_effectiveToRound_idx"
  ON "SeasonTeamDepthChartEntry"("seasonId", "teamId", "effectiveToRound");
