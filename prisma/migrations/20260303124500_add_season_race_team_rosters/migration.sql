-- CreateEnum
CREATE TYPE "RosterDriverRole" AS ENUM ('MAIN', 'RESERVE');

-- CreateTable
CREATE TABLE "SeasonRaceTeamRoster" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonRaceTeamRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonRaceTeamRosterItem" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "role" "RosterDriverRole" NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonRaceTeamRosterItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonRaceTeamRoster_seasonId_raceId_teamId_key" ON "SeasonRaceTeamRoster"("seasonId", "raceId", "teamId");

-- CreateIndex
CREATE INDEX "SeasonRaceTeamRoster_seasonId_raceId_idx" ON "SeasonRaceTeamRoster"("seasonId", "raceId");

-- CreateIndex
CREATE INDEX "SeasonRaceTeamRoster_seasonId_teamId_idx" ON "SeasonRaceTeamRoster"("seasonId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonRaceTeamRosterItem_rosterId_driverId_key" ON "SeasonRaceTeamRosterItem"("rosterId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonRaceTeamRosterItem_rosterId_role_priority_key" ON "SeasonRaceTeamRosterItem"("rosterId", "role", "priority");

-- CreateIndex
CREATE INDEX "SeasonRaceTeamRosterItem_rosterId_role_priority_idx" ON "SeasonRaceTeamRosterItem"("rosterId", "role", "priority");

-- CreateIndex
CREATE INDEX "SeasonRaceTeamRosterItem_driverId_idx" ON "SeasonRaceTeamRosterItem"("driverId");

-- AddForeignKey
ALTER TABLE "SeasonRaceTeamRoster" ADD CONSTRAINT "SeasonRaceTeamRoster_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRaceTeamRoster" ADD CONSTRAINT "SeasonRaceTeamRoster_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRaceTeamRoster" ADD CONSTRAINT "SeasonRaceTeamRoster_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRaceTeamRosterItem" ADD CONSTRAINT "SeasonRaceTeamRosterItem_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "SeasonRaceTeamRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRaceTeamRosterItem" ADD CONSTRAINT "SeasonRaceTeamRosterItem_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
