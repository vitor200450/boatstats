-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "boatMaterial" TEXT,
ADD COLUMN     "boatType" TEXT,
ADD COLUMN     "colorCode" TEXT;

-- CreateIndex
CREATE INDEX "Driver_currentName_idx" ON "Driver"("currentName");
