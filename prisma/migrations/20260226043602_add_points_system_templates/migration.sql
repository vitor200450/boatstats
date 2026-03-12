-- CreateTable
CREATE TABLE "PointsSystemTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "pointsData" JSONB NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsSystemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsSystemTemplate_userId_idx" ON "PointsSystemTemplate"("userId");

-- AddForeignKey
ALTER TABLE "PointsSystemTemplate" ADD CONSTRAINT "PointsSystemTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
