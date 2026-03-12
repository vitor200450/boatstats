import { fetchFrosthexAPI, fetchFrosthexAPIv2, fetchFrosthexAPIv3 } from "./frosthexApiClient";

export interface FrosthexTrack {
  id: number;
  name: string;
  commandName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FrosthexTracksResponse {
  totalCount: number;
  tracks: FrosthexTrack[];
}

type RawTrack = {
  id?: number | string;
  name?: string;
  commandName?: string;
  command_name?: string;
  track_name?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

type RawTracksPayload = {
  totalCount?: number;
  total_count?: number;
  tracks?: RawTrack[];
};

export interface FrosthexPlayer {
  uuid: string;
  username: string;
  lastPlayed: number;
  // Note: we can map more fields later if we want to display total playtime, etc.
}

// Time Trial API v2 Types
export interface FrosthexTimeTrialEntry {
  rank: number;
  uuid: string;
  username: string;
  time: number; // milliseconds
  date?: number; // timestamp
}

type RawTimeTrialEntry = {
  rank?: number | string;
  uuid?: string;
  player_uuid?: string;
  username?: string;
  name?: string;
  time?: number | string;
  date?: number | string;
};

type RawTimeTrialPayload =
  | RawTimeTrialEntry[]
  | {
      entries?: RawTimeTrialEntry[];
      leaderboard?: RawTimeTrialEntry[];
      records?: RawTimeTrialEntry[];
      times?: RawTimeTrialEntry[];
      top_list?: RawTimeTrialEntry[];
    };

// Types based on W4FC-response.json
export interface FrosthexLap {
  time: number;
  pitstop: boolean;
  fastest: boolean;
}

export interface FrosthexDriverResult {
  position: number;
  start_position: number;
  name: string;
  uuid: string; // This is the crucial field to link to our Driver model
  finish_time: number;
  laps: FrosthexLap[];
}

export interface FrosthexHeat {
  name: string; // e.g., "R1Q1" or "Grand Final"
  driver_results: FrosthexDriverResult[];
}

export interface FrosthexRound {
  name: string; // e.g., "R1-Qualy" or "R5-Race"
  type: string; // e.g., "QUALIFICATION" or "RACE"
  heats: FrosthexHeat[];
}

export interface FrosthexEventResultResponse {
  name: string;
  date: number;
  track_name: string;
  participant_count: number;
  rounds: FrosthexRound[];
}

export const getTracks = async (): Promise<FrosthexTracksResponse> => {
  const payload = await fetchFrosthexAPIv3<RawTracksPayload | RawTrack[]>(
    "/tracks",
    300,
  );

  const rawTracks = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tracks)
      ? payload.tracks
      : [];

  const mappedTracks: FrosthexTrack[] = rawTracks
    .map((track, index) => {
      const commandName =
        typeof track.commandName === "string"
          ? track.commandName
          : typeof track.command_name === "string"
            ? track.command_name
            : "";

      const name =
        typeof track.name === "string"
          ? track.name
          : typeof track.track_name === "string"
            ? track.track_name
            : commandName;

      const id =
        typeof track.id === "number"
          ? track.id
          : Number.isFinite(Number(track.id))
            ? Number(track.id)
            : index;

      return {
        id,
        name,
        commandName,
        createdAt:
          typeof track.createdAt === "string"
            ? track.createdAt
            : typeof track.created_at === "string"
              ? track.created_at
              : "",
        updatedAt:
          typeof track.updatedAt === "string"
            ? track.updatedAt
            : typeof track.updated_at === "string"
              ? track.updated_at
              : "",
      };
    })
    .filter((track) => track.commandName.trim() !== "");

  const getTrackTimestamp = (track: FrosthexTrack): number => {
    const rawTimestamp = track.updatedAt || track.createdAt;
    const parsedTimestamp = Date.parse(rawTimestamp);
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  };

  const dedupedTracksMap = new Map<string, FrosthexTrack>();

  for (const track of mappedTracks) {
    const key = (track.name || track.commandName).trim().toLowerCase();
    const existing = dedupedTracksMap.get(key);

    if (!existing) {
      dedupedTracksMap.set(key, track);
      continue;
    }

    const existingTimestamp = getTrackTimestamp(existing);
    const incomingTimestamp = getTrackTimestamp(track);

    if (incomingTimestamp > existingTimestamp) {
      dedupedTracksMap.set(key, track);
      continue;
    }

    if (incomingTimestamp === existingTimestamp && track.id > existing.id) {
      dedupedTracksMap.set(key, track);
    }
  }

  const tracks = Array.from(dedupedTracksMap.values());

  const parseYearAlias = (value: string): { base: string; year: number } | null => {
    const match = value.trim().match(/^(.*?)[-_]?(20\d{2})$/i);
    if (!match) return null;

    const year = Number(match[2]);
    if (!Number.isFinite(year)) return null;

    const base = match[1].replace(/[-_\s]+$/, "").trim().toLowerCase();
    if (!base) return null;

    return { base, year };
  };

  const latestYearAliasByBase = new Map<
    string,
    { track: FrosthexTrack; year: number; timestamp: number }
  >();

  for (const track of tracks) {
    const alias = parseYearAlias(track.commandName) ?? parseYearAlias(track.name);
    if (!alias) continue;

    const timestamp = getTrackTimestamp(track);
    const existing = latestYearAliasByBase.get(alias.base);

    if (!existing) {
      latestYearAliasByBase.set(alias.base, { track, year: alias.year, timestamp });
      continue;
    }

    if (alias.year > existing.year) {
      latestYearAliasByBase.set(alias.base, { track, year: alias.year, timestamp });
      continue;
    }

    if (alias.year === existing.year && timestamp > existing.timestamp) {
      latestYearAliasByBase.set(alias.base, { track, year: alias.year, timestamp });
    }
  }

  const filteredTracks = tracks.filter((track) => {
    const alias = parseYearAlias(track.commandName) ?? parseYearAlias(track.name);
    if (!alias) return true;

    const latest = latestYearAliasByBase.get(alias.base);
    return latest?.track.commandName.toLowerCase() === track.commandName.toLowerCase();
  });

  const totalCount = Array.isArray(payload)
    ? filteredTracks.length
    : typeof payload?.totalCount === "number"
      ? payload.totalCount
      : typeof payload?.total_count === "number"
        ? payload.total_count
        : filteredTracks.length;

  return {
    totalCount,
    tracks: filteredTracks,
  };
};

export const getPlayerByUuid = async (
  uuid: string,
): Promise<FrosthexPlayer> => {
  return fetchFrosthexAPI<FrosthexPlayer>(`/players/${uuid}`);
};

export const getPlayerByUuidSafe = async (
  uuid: string,
): Promise<FrosthexPlayer | null> => {
  try {
    return await fetchFrosthexAPI<FrosthexPlayer>(`/players/${uuid}`, 60, true);
  } catch {
    return null;
  }
};

export const getEventResults = async (
  eventName: string,
): Promise<FrosthexEventResultResponse> => {
  // The API returns the raw JSON object structure from W4FC-response.json
  // Note: Depending on the exact wrapper, we might just get the raw JSON directly.
  // The interface above might need adjustment based on the actual root structure.
  return fetchFrosthexAPI<FrosthexEventResultResponse>(
    `/events/results/${eventName}`,
  );
};

// Time Trial API v2
export const getTrackTimeTrial = async (
  trackName: string,
): Promise<FrosthexTimeTrialEntry[]> => {
  const payload = await fetchFrosthexAPIv2<RawTimeTrialPayload>(
    `/tracks/${encodeURIComponent(trackName)}`,
    300, // Cache for 5 minutes
  );

  const rawEntries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.entries)
      ? payload.entries
      : Array.isArray(payload?.leaderboard)
        ? payload.leaderboard
        : Array.isArray(payload?.records)
          ? payload.records
          : Array.isArray(payload?.times)
            ? payload.times
            : Array.isArray(payload?.top_list)
              ? payload.top_list
            : [];

  return rawEntries
    .map((entry, index) => {
      const rank =
        Number.isFinite(Number(entry.rank)) && Number(entry.rank) > 0
          ? Number(entry.rank)
          : index + 1;

      const time = Number(entry.time);
      const date = Number(entry.date);

      return {
        rank,
        uuid:
          typeof entry.uuid === "string"
            ? entry.uuid
            : typeof entry.player_uuid === "string"
              ? entry.player_uuid
              : "",
        username:
          typeof entry.username === "string"
            ? entry.username
            : typeof entry.name === "string"
              ? entry.name
              : "",
        time: Number.isFinite(time) ? time : 0,
        date: Number.isFinite(date) ? date : undefined,
      };
    })
    .filter(
      (entry) =>
        entry.uuid.trim() !== "" &&
        Number.isFinite(entry.time) &&
        entry.time > 0,
    );
};
