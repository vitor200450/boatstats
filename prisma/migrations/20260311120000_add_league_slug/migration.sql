-- Add nullable slug first to support backfill
ALTER TABLE "League" ADD COLUMN "slug" TEXT;

-- Backfill slug using league name with deterministic suffixes
WITH base_names AS (
  SELECT
    l."id",
    CASE
      WHEN btrim(regexp_replace(regexp_replace(lower(l."name"), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'), '-') = '' THEN 'league'
      ELSE btrim(regexp_replace(regexp_replace(lower(l."name"), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'), '-')
    END AS base_slug
  FROM "League" l
),
ranked AS (
  SELECT
    b."id",
    b.base_slug,
    row_number() OVER (PARTITION BY b.base_slug ORDER BY b."id") AS seq
  FROM base_names b
)
UPDATE "League" l
SET "slug" = CASE
  WHEN r.seq = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.seq
END
FROM ranked r
WHERE l."id" = r."id";

-- Enforce required + unique after backfill
ALTER TABLE "League" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
