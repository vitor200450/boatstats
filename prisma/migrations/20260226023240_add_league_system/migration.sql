/*
  Warnings:

  - You are about to drop the column `pointsSystem` on the `League` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RaceStatus" AS ENUM ('SCHEDULED', 'PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'CONFIGURED', 'IMPORTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StandingType" AS ENUM ('DRIVER', 'TEAM');

-- AlterTable
ALTER TABLE "League" DROP COLUMN "pointsSystem";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "LeagueAdmin" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT,

    CONSTRAINT "LeagueAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "pointsSystem" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonTeamAssignment" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "SeasonTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "apiEventId" TEXT,
    "apiEventCache" JSONB,
    "trackApiName" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "status" "RaceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRound" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "apiRoundName" TEXT NOT NULL,
    "apiRoundType" TEXT NOT NULL,
    "targetHeatName" TEXT,
    "pointsSystem" JSONB,
    "countsForStandings" BOOLEAN NOT NULL DEFAULT true,
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "EventRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundResult" (
    "id" TEXT NOT NULL,
    "eventRoundId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "startPosition" INTEGER,
    "finishTimeMs" INTEGER,
    "fastestLap" BOOLEAN NOT NULL DEFAULT false,
    "pitstops" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "fastestLapTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standing" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "type" "StandingType" NOT NULL,
    "driverId" TEXT,
    "teamId" TEXT,
    "position" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "podiums" INTEGER NOT NULL DEFAULT 0,
    "racePoints" JSONB NOT NULL,
    "bestFinishes" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "LeagueAdmin_leagueId_idx" ON "LeagueAdmin"("leagueId");

-- CreateIndex
CREATE INDEX "LeagueAdmin_userId_idx" ON "LeagueAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueAdmin_leagueId_userId_key" ON "LeagueAdmin"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "Season_leagueId_idx" ON "Season"("leagueId");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Season_leagueId_name_key" ON "Season"("leagueId", "name");

-- CreateIndex
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_leagueId_name_key" ON "Team"("leagueId", "name");

-- CreateIndex
CREATE INDEX "SeasonTeamAssignment_seasonId_idx" ON "SeasonTeamAssignment"("seasonId");

-- CreateIndex
CREATE INDEX "SeasonTeamAssignment_teamId_idx" ON "SeasonTeamAssignment"("teamId");

-- CreateIndex
CREATE INDEX "SeasonTeamAssignment_driverId_idx" ON "SeasonTeamAssignment"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTeamAssignment_seasonId_driverId_key" ON "SeasonTeamAssignment"("seasonId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Race_apiEventId_key" ON "Race"("apiEventId");

-- CreateIndex
CREATE INDEX "Race_seasonId_idx" ON "Race"("seasonId");

-- CreateIndex
CREATE INDEX "Race_status_idx" ON "Race"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Race_seasonId_round_key" ON "Race"("seasonId", "round");

-- CreateIndex
CREATE INDEX "EventRound_raceId_idx" ON "EventRound"("raceId");

-- CreateIndex
CREATE INDEX "EventRound_status_idx" ON "EventRound"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRound_raceId_apiRoundName_key" ON "EventRound"("raceId", "apiRoundName");

-- CreateIndex
CREATE INDEX "RoundResult_eventRoundId_idx" ON "RoundResult"("eventRoundId");

-- CreateIndex
CREATE INDEX "RoundResult_driverId_idx" ON "RoundResult"("driverId");

-- CreateIndex
CREATE INDEX "RoundResult_position_idx" ON "RoundResult"("position");

-- CreateIndex
CREATE UNIQUE INDEX "RoundResult_eventRoundId_driverId_key" ON "RoundResult"("eventRoundId", "driverId");

-- CreateIndex
CREATE INDEX "Standing_seasonId_idx" ON "Standing"("seasonId");

-- CreateIndex
CREATE INDEX "Standing_type_idx" ON "Standing"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_seasonId_type_driverId_key" ON "Standing"("seasonId", "type", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_seasonId_type_teamId_key" ON "Standing"("seasonId", "type", "teamId");

-- CreateIndex
CREATE INDEX "Driver_uuid_idx" ON "Driver"("uuid");

-- CreateIndex
CREATE INDEX "League_ownerId_idx" ON "League"("ownerId");

-- CreateIndex
CREATE INDEX "Result_eventId_idx" ON "Result"("eventId");

-- CreateIndex
CREATE INDEX "Result_driverId_idx" ON "Result"("driverId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueAdmin" ADD CONSTRAINT "LeagueAdmin_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueAdmin" ADD CONSTRAINT "LeagueAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTeamAssignment" ADD CONSTRAINT "SeasonTeamAssignment_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTeamAssignment" ADD CONSTRAINT "SeasonTeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTeamAssignment" ADD CONSTRAINT "SeasonTeamAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRound" ADD CONSTRAINT "EventRound_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_eventRoundId_fkey" FOREIGN KEY ("eventRoundId") REFERENCES "EventRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
