-- CreateTable
CREATE TABLE "SeasonTeamDepthChartEntry" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonTeamDepthChartEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTeamDepthChartEntry_seasonId_teamId_driverId_key" ON "SeasonTeamDepthChartEntry"("seasonId", "teamId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTeamDepthChartEntry_seasonId_teamId_priority_key" ON "SeasonTeamDepthChartEntry"("seasonId", "teamId", "priority");

-- CreateIndex
CREATE INDEX "SeasonTeamDepthChartEntry_seasonId_teamId_priority_idx" ON "SeasonTeamDepthChartEntry"("seasonId", "teamId", "priority");

-- CreateIndex
CREATE INDEX "SeasonTeamDepthChartEntry_seasonId_driverId_idx" ON "SeasonTeamDepthChartEntry"("seasonId", "driverId");

-- AddForeignKey
ALTER TABLE "SeasonTeamDepthChartEntry" ADD CONSTRAINT "SeasonTeamDepthChartEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTeamDepthChartEntry" ADD CONSTRAINT "SeasonTeamDepthChartEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTeamDepthChartEntry" ADD CONSTRAINT "SeasonTeamDepthChartEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
