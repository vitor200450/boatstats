-- Safe additive migration for manual EventRound origin metadata.

DO $$
BEGIN
  CREATE TYPE "RoundOrigin" AS ENUM ('API', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ManualRoundKind" AS ENUM ('FINAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EventRound"
ADD COLUMN IF NOT EXISTS "origin" "RoundOrigin" NOT NULL DEFAULT 'API',
ADD COLUMN IF NOT EXISTS "manualKind" "ManualRoundKind",
ADD COLUMN IF NOT EXISTS "manualBaseRoundId" TEXT,
ADD COLUMN IF NOT EXISTS "manualCreatedById" TEXT,
ADD COLUMN IF NOT EXISTS "manualCreatedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EventRound_manualBaseRoundId_fkey'
  ) THEN
    ALTER TABLE "EventRound"
    ADD CONSTRAINT "EventRound_manualBaseRoundId_fkey"
    FOREIGN KEY ("manualBaseRoundId") REFERENCES "EventRound"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EventRound_origin_idx" ON "EventRound"("origin");
