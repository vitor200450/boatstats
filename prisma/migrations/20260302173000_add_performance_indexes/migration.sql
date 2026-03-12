-- Performance indexes for remote Postgres latency reduction
CREATE INDEX IF NOT EXISTS "SeasonTeamAssignment_seasonId_leftAt_driverId_idx"
  ON "SeasonTeamAssignment"("seasonId", "leftAt", "driverId");

CREATE INDEX IF NOT EXISTS "Race_seasonId_status_idx"
  ON "Race"("seasonId", "status");

CREATE INDEX IF NOT EXISTS "Race_seasonId_round_idx"
  ON "Race"("seasonId", "round");

CREATE INDEX IF NOT EXISTS "RoundResult_eventRoundId_position_idx"
  ON "RoundResult"("eventRoundId", "position");

CREATE INDEX IF NOT EXISTS "Standing_seasonId_type_position_idx"
  ON "Standing"("seasonId", "type", "position");
