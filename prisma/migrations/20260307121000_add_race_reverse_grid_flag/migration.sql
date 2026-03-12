-- Safe additive migration: does not delete or rewrite existing race data.
-- Existing rows will receive reverseGridEnabled = false.

ALTER TABLE "Race"
ADD COLUMN IF NOT EXISTS "reverseGridEnabled" BOOLEAN NOT NULL DEFAULT false;
