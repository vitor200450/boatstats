-- Safe additive migration for manual round-result overrides.

ALTER TABLE "RoundResult"
ADD COLUMN IF NOT EXISTS "manualPositionOverride" INTEGER,
ADD COLUMN IF NOT EXISTS "manualPreviousPosition" INTEGER,
ADD COLUMN IF NOT EXISTS "manualOriginalPosition" INTEGER,
ADD COLUMN IF NOT EXISTS "manualEditedById" TEXT,
ADD COLUMN IF NOT EXISTS "manualEditedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "manualEditReason" TEXT;
