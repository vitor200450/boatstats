-- CreateTable
CREATE TABLE "RaceResultBonus" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaceResultBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaceResultBonus_raceId_driverId_key" ON "RaceResultBonus"("raceId", "driverId");

-- CreateIndex
CREATE INDEX "RaceResultBonus_raceId_idx" ON "RaceResultBonus"("raceId");

-- CreateIndex
CREATE INDEX "RaceResultBonus_driverId_idx" ON "RaceResultBonus"("driverId");

-- AddForeignKey
ALTER TABLE "RaceResultBonus" ADD CONSTRAINT "RaceResultBonus_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResultBonus" ADD CONSTRAINT "RaceResultBonus_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResultBonus" ADD CONSTRAINT "RaceResultBonus_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
