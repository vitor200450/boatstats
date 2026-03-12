-- CreateEnum
CREATE TYPE "RoundSpecialType" AS ENUM ('NONE', 'SPRINT');

-- CreateEnum
CREATE TYPE "SprintMode" AS ENUM ('CLASSIFICATION', 'POINTS');

-- AlterTable
ALTER TABLE "Season"
ADD COLUMN "sprintConfig" JSONB;

-- AlterTable
ALTER TABLE "EventRound"
ADD COLUMN "specialType" "RoundSpecialType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "sprintMode" "SprintMode";

-- Add consistency check
ALTER TABLE "EventRound"
ADD CONSTRAINT "EventRound_specialType_sprintMode_consistency"
CHECK (
  ("specialType" = 'NONE' AND "sprintMode" IS NULL)
  OR
  ("specialType" = 'SPRINT' AND "sprintMode" IS NOT NULL)
);

-- At most one sprint round per race
CREATE UNIQUE INDEX "EventRound_raceId_single_sprint_key"
  ON "EventRound"("raceId")
  WHERE "specialType" = 'SPRINT';
