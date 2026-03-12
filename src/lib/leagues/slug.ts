import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toSlugBase(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "league";
}

export async function buildUniqueLeagueSlug(
  name: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<string> {
  const baseSlug = toSlugBase(name);

  const existing = await client.league.findMany({
    where: { slug: { startsWith: baseSlug } },
    select: { slug: true },
  });

  if (existing.length === 0) {
    return baseSlug;
  }

  const exactMatch = existing.some((entry) => entry.slug === baseSlug);
  if (!exactMatch) {
    return baseSlug;
  }

  const matcher = new RegExp(`^${escapeRegExp(baseSlug)}-(\\d+)$`);
  let maxSuffix = 1;

  for (const entry of existing as Array<{ slug: string }>) {
    const match = matcher.exec(entry.slug);
    if (!match) continue;
    const suffix = Number(match[1]);
    if (Number.isFinite(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  }

  return `${baseSlug}-${maxSuffix + 1}`;
}
