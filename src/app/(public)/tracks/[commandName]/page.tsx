import {
  FrosthexTimeTrialEntry,
  FrosthexTrack,
  getTracks,
  getTrackTimeTrial,
} from "@/services/frosthexAPI";
import { fetchPlayerDataByUUID } from "@/lib/minecraft-api";
import { prisma } from "@/lib/prisma";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";
import { ArrowLeft, Clock, Route } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const revalidate = 300;
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ commandName: string }>;
}

type NormalizedEntry = {
  rank: number;
  uuid: string;
  username: string;
  time: number;
  date?: number;
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
  const clean = value.replace(/-/g, "").toLowerCase();
  return /^[a-f0-9]{32}$/.test(clean);
}

function parseTrackYearAlias(value: string): { base: string; year: number } | null {
  const match = value.trim().match(/^(.*?)[-_]?(20\d{2})$/i);
  if (!match) return null;

  const year = Number(match[2]);
  if (!Number.isFinite(year)) return null;

  const base = match[1].replace(/[-_\s]+$/, "").trim().toLowerCase();
  if (!base) return null;

  return { base, year };
}

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return "--:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}

function normalizeEntries(entries: FrosthexTimeTrialEntry[]): NormalizedEntry[] {
  const validEntries = entries
    .filter(
      (entry) =>
        Number.isFinite(entry?.time) &&
        entry.time > 0 &&
        typeof entry?.uuid === "string" &&
        entry.uuid.trim() !== "",
    )
    .map((entry, index) => ({
      rank:
        Number.isFinite(entry.rank) && entry.rank > 0
          ? entry.rank
          : index + 1,
      uuid: entry.uuid,
      username: entry.username,
      time: entry.time,
      date: entry.date,
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.time - b.time;
    });

  return validEntries;
}

export default async function TrackDetailPage({ params }: PageProps) {
  const locale = await getRequestLocale();
  const { commandName: rawCommandName } = await params;
  const commandName = decodeURIComponent(rawCommandName);

  let detailEntries: FrosthexTimeTrialEntry[] = [];

  try {
    detailEntries = await getTrackTimeTrial(commandName);
  } catch (error) {
    console.error(`Error fetching track detail for ${commandName}:`, error);
    notFound();
  }

  let track: FrosthexTrack | null = null;
  let availableTracks: FrosthexTrack[] = [];
  try {
    const tracksResponse = await getTracks();
    availableTracks = tracksResponse.tracks;
    track =
      tracksResponse.tracks.find(
        (item) => item.commandName.toLowerCase() === commandName.toLowerCase(),
      ) ?? null;
  } catch (error) {
    console.error("Error fetching tracks metadata:", error);
  }

  const normalizedEntries = normalizeEntries(detailEntries);

  if (normalizedEntries.length === 0) {
    const requestedAlias = parseTrackYearAlias(commandName);

    if (requestedAlias) {
      const candidates = availableTracks
        .map((item) => {
          const alias = parseTrackYearAlias(item.commandName) ?? parseTrackYearAlias(item.name);
          return alias ? { item, alias } : null;
        })
        .filter((candidate): candidate is { item: FrosthexTrack; alias: { base: string; year: number } } =>
          Boolean(candidate),
        )
        .filter(
          ({ item, alias }) =>
            alias.base === requestedAlias.base &&
            alias.year > requestedAlias.year &&
            item.commandName.toLowerCase() !== commandName.toLowerCase(),
        )
        .sort((a, b) => b.alias.year - a.alias.year);

      for (const candidate of candidates) {
        try {
            const candidateEntries = await getTrackTimeTrial(candidate.item.commandName);
            if (normalizeEntries(candidateEntries).length > 0) {
              redirect(addLocalePrefix(`/tracks/${encodeURIComponent(candidate.item.commandName)}`, locale));
            }
          } catch {
          // Ignore candidate lookup failures and continue rendering current page.
        }
      }
    }
  }

  const top10 = normalizedEntries.slice(0, 10);

  const missingNameUuids = Array.from(
    new Set(
      top10
        .filter(
          (entry) =>
            entry.username.trim() === "" || isUuidLike(entry.username.trim()),
        )
        .map((entry) => entry.uuid),
    ),
  );

  const nameMap = new Map<string, string>();

  if (missingNameUuids.length > 0) {
    const uuidCandidates = Array.from(
      new Set(
        missingNameUuids.flatMap((uuid) => {
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

  const unresolvedUuids = missingNameUuids.filter(
    (uuid) => !nameMap.has(normalizeUuid(uuid)),
  );

  await Promise.all(
    unresolvedUuids.map(async (uuid) => {
      const playerData = await fetchPlayerDataByUUID(uuid);

      if (
        typeof playerData?.name === "string" &&
        playerData.name.trim() !== "" &&
        !isUuidLike(playerData.name)
      ) {
        const resolvedUuid = toDashedUuid(uuid);

        try {
          await prisma.driver.upsert({
            where: { uuid: resolvedUuid },
            update: {
              currentName: playerData.name,
              colorCode: playerData.colorCode,
              boatType: playerData.boatType,
              boatMaterial: playerData.boatMaterial,
            },
            create: {
              uuid: resolvedUuid,
              currentName: playerData.name,
              colorCode: playerData.colorCode,
              boatType: playerData.boatType,
              boatMaterial: playerData.boatMaterial,
            },
          });
        } catch {
          // Name resolution should not break track page rendering.
        }

        nameMap.set(normalizeUuid(uuid), playerData.name);
      }
    }),
  );

  const enrichedTop10 = top10.map((entry) => {
    const driverUuid = toDashedUuid(entry.uuid);
    const resolvedUsername =
      entry.username.trim() !== ""
        ? entry.username
        : nameMap.get(normalizeUuid(entry.uuid)) ?? `${driverUuid.slice(0, 8)}...`;

    return {
      ...entry,
      uuid: driverUuid,
      username: resolvedUsername,
    };
  });

  const record = enrichedTop10[0] ?? null;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-10">
        <Link
          href={addLocalePrefix("/tracks", locale)}
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors mb-4 text-sm font-mono"
        >
          <ArrowLeft size={16} />
          {t(locale, "public.trackDetail.backToTracks")}
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
              {track?.name ?? commandName}
            </h1>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              {normalizedEntries.length}
            </div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              {t(locale, "public.trackDetail.entriesLabel")}
            </div>
          </div>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-cyan-500/50 via-zinc-800 to-transparent mt-6"></div>
      </div>

      {record ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          <div className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-mono">
            {t(locale, "public.trackDetail.currentRecordTitle")}
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                <span className="text-[11px] font-mono font-bold tracking-wide text-yellow-300">
                  WR
                </span>
              </div>
              <img
                src={`https://mc-heads.net/avatar/${record.uuid}/28`}
                alt={record.username}
                className="w-8 h-8 rounded"
              />
              <Link
                href={addLocalePrefix(`/driver/${record.uuid}`, locale)}
                className="text-cyan-400 hover:underline truncate"
              >
                {record.username}
              </Link>
            </div>

            <div className="flex items-center gap-2 text-zinc-300 font-mono text-2xl tracking-tight">
              <Clock className="w-4 h-4 text-zinc-500" />
              {formatTime(record.time)}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-xl mb-8">
          <Route className="w-14 h-14 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-medium">{t(locale, "public.trackDetail.noRecordsTitle")}</p>
          <p className="text-zinc-500 mt-2">{t(locale, "public.trackDetail.noRecordsSubtitle")}</p>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-white font-bold font-mono">{t(locale, "public.trackDetail.top10Title")}</h2>
        </div>

        {enrichedTop10.length === 0 ? (
          <div className="py-10 text-center text-zinc-500">{t(locale, "public.trackDetail.noRecordsTitle")}</div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-zinc-800/60">
              {enrichedTop10.map((entry) => (
                <div
                  key={`${entry.uuid}-${entry.rank}-${entry.time}`}
                  className="px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-zinc-500 mb-1">
                        #{entry.rank}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={`https://mc-heads.net/avatar/${entry.uuid}/24`}
                          alt={entry.username}
                          className="w-6 h-6 rounded shrink-0"
                        />
                        <Link
                          href={addLocalePrefix(`/driver/${entry.uuid}`, locale)}
                          className="text-cyan-400 hover:underline truncate"
                        >
                          {entry.username}
                        </Link>
                      </div>
                    </div>
                    <div className="text-zinc-200 font-mono text-base shrink-0">
                      {formatTime(entry.time)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[540px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 font-mono border-b border-zinc-800">
                    <th className="px-6 py-3">{t(locale, "public.trackDetail.rankLabel")}</th>
                    <th className="px-6 py-3">{t(locale, "public.trackDetail.rankLabel")}</th>
                    <th className="px-6 py-3">{t(locale, "public.trackDetail.driverLabel")}</th>
                    <th className="px-6 py-3">{t(locale, "public.trackDetail.timeLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedTop10.map((entry) => (
                    <tr key={`${entry.uuid}-${entry.rank}-${entry.time}`} className="border-b border-zinc-800/60">
                      <td className="px-6 py-4 text-zinc-300 font-mono">#{entry.rank}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={`https://mc-heads.net/avatar/${entry.uuid}/24`}
                            alt={entry.username}
                            className="w-6 h-6 rounded"
                          />
                          <Link
                            href={addLocalePrefix(`/driver/${entry.uuid}`, locale)}
                            className="text-cyan-400 hover:underline truncate"
                          >
                            {entry.username}
                          </Link>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-300 font-mono text-lg">
                        {formatTime(entry.time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
