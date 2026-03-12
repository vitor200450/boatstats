-- DropIndex
DROP INDEX "SeasonTeamAssignment_seasonId_driverId_key";

-- CreateIndex: partial unique index — only one active assignment per (season, driver)
-- Multiple historical records (leftAt IS NOT NULL) are allowed for transfer history
CREATE UNIQUE INDEX "SeasonTeamAssignment_seasonId_driverId_active_key"
  ON "SeasonTeamAssignment"("seasonId", "driverId")
  WHERE "leftAt" IS NULL;
