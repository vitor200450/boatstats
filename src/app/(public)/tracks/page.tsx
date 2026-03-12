import { FrosthexTrack, getTrackTimeTrial, getTracks } from "@/services/frosthexAPI";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Route } from "lucide-react";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";

import TracksCatalogClient from "./TracksCatalogClient";

export const revalidate = 300;

type TrackCardStats = {
  entries: number;
  bestTimeMs: number | null;
  recordHolder: string | null;
};

type TrackCardStatsDraft = {
  entries: number;
  bestTimeMs: number | null;
  recordHolderUuid: string | null;
  recordHolderRawName: string | null;
};

function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function toDashedUuid(uuid: string): string {
  const cleaned = normalizeUuid(uuid);
  if (cleaned.length !== 32) return uuid;
  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(
    12,
    16,
  )}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
}

function isUuidLike(value: string): boolean {
  return /^[a-f0-9]{32}$/.test(normalizeUuid(value));
}

export default async function TracksCatalogPage() {
  const locale = await getRequestLocale();
  let tracks: FrosthexTrack[] = [];
  let hasError = false;
  let trackStatsByCommand: Record<string, TrackCardStats> = {};

  try {
    const response = await getTracks();
    if (Array.isArray(response?.tracks)) {
      tracks = response.tracks
        .filter(
          (track) =>
            typeof track?.commandName === "string" &&
            track.commandName.trim() !== "",
        )
        .sort((a, b) => {
          const nameA = typeof a?.name === "string" ? a.name : "";
          const nameB = typeof b?.name === "string" ? b.name : "";
          return nameA.localeCompare(nameB);
        });
    }
  } catch (error) {
    console.error("Error fetching tracks catalog:", error);
    hasError = true;
  }

  if (!hasError && tracks.length > 0) {
    const statsResults = await Promise.allSettled(
      tracks.map(async (track) => {
        const entries = await getTrackTimeTrial(track.commandName);
        const validEntries = entries.filter(
          (entry) =>
            Number.isFinite(entry?.time) &&
            entry.time > 0 &&
            typeof entry?.uuid === "string" &&
            entry.uuid.trim() !== "",
        );

        const bestTimeMs =
          validEntries.length > 0
            ? Math.min(...validEntries.map((entry) => entry.time))
            : null;

        const bestEntry =
          validEntries.length > 0
            ? validEntries.reduce((best, current) =>
                current.time < best.time ? current : best,
              )
            : null;

        const recordHolderRawName = bestEntry?.username?.trim() || null;
        const recordHolderUuid = bestEntry?.uuid || null;

        return [
          track.commandName.toLowerCase(),
          {
            entries: validEntries.length,
            bestTimeMs,
            recordHolderRawName,
            recordHolderUuid,
          },
        ] as const;
      }),
    );

    const draftStatsByCommand = Object.fromEntries(
      statsResults
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<
            readonly [string, TrackCardStatsDraft]
          > => result.status === "fulfilled",
        )
        .map((result) => result.value),
    );

    const uuidsNeedingLookup = Array.from(
      new Set(
        Object.values(draftStatsByCommand)
          .filter(
            (stats) =>
              stats.recordHolderUuid &&
              (!stats.recordHolderRawName ||
                isUuidLike(stats.recordHolderRawName)),
          )
          .map((stats) => stats.recordHolderUuid as string),
      ),
    );

    const nameMap = new Map<string, string>();

    if (uuidsNeedingLookup.length > 0) {
      const uuidCandidates = Array.from(
        new Set(
          uuidsNeedingLookup.flatMap((uuid) => {
            const dashed = toDashedUuid(uuid);
            const normalized = normalizeUuid(uuid);
            return [uuid, dashed, normalized];
          }),
        ),
      );

      const localDrivers = await prisma.driver.findMany({
        where: {
          uuid: {
            in: uuidCandidates,
          },
        },
        select: {
          uuid: true,
          currentName: true,
        },
      });

      for (const driver of localDrivers) {
        if (typeof driver.currentName === "string" && driver.currentName.trim() !== "") {
          nameMap.set(normalizeUuid(driver.uuid), driver.currentName);
        }
      }
    }

    trackStatsByCommand = Object.fromEntries(
      Object.entries(draftStatsByCommand).map(([commandName, stats]) => {
        let recordHolder: string | null = null;

        if (stats.recordHolderRawName && !isUuidLike(stats.recordHolderRawName)) {
          recordHolder = stats.recordHolderRawName;
        } else if (stats.recordHolderUuid) {
          recordHolder =
            nameMap.get(normalizeUuid(stats.recordHolderUuid)) ??
            `${toDashedUuid(stats.recordHolderUuid).slice(0, 8)}...`;
        }

        return [
          commandName,
          {
            entries: stats.entries,
            bestTimeMs: stats.bestTimeMs,
            recordHolder,
          },
        ] as const;
      }),
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-10">
        <Link
          href={addLocalePrefix("/", locale)}
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors mb-4 text-sm font-mono"
        >
          <ArrowLeft size={16} />
          {t(locale, "public.tracksCatalog.backHome")}
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <nav className="flex items-center gap-2 text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wide">
              <span className="text-neutral-300">{t(locale, "public.tracksCatalog.breadcrumb")}</span>
            </nav>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
              {t(locale, "public.tracksCatalog.title")}
            </h1>
            <p className="text-zinc-500 mt-2 max-w-2xl">{t(locale, "public.tracksCatalog.description")}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              {tracks.length}
            </div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              {t(locale, "public.tracksCatalog.tracksLabel")}
            </div>
          </div>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-cyan-500/50 via-zinc-800 to-transparent mt-6"></div>
      </div>

      {hasError ? (
        <div className="text-center py-20 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Route className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-medium">{t(locale, "public.tracksCatalog.unavailableTitle")}</p>
          <p className="text-zinc-500 mt-2">{t(locale, "public.tracksCatalog.unavailableSubtitle")}</p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Route className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-medium">{t(locale, "public.tracksCatalog.emptyTitle")}</p>
          <p className="text-zinc-500 mt-2">{t(locale, "public.tracksCatalog.emptySubtitle")}</p>
        </div>
      ) : (
        <TracksCatalogClient
          tracks={tracks}
          trackStatsByCommand={trackStatsByCommand}
          locale={locale}
        />
      )}
    </div>
  );
}
