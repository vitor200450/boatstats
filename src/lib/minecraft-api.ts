// Minecraft API utilities for fetching player data
// Primary: Frosthex API (rich data)
// Fallback: Mojang API (basic UUID + name)
// Last resort: Local database (for players who changed names)

const FROSTHEX_API_KEY = process.env.FROSTHEX_API_KEY;
const FROSTHEX_BASE_URL = "http://fc1.api.frosthex.com/api/v1/readonly";
const MOJANG_BASE_URL = "https://api.mojang.com";

export interface FrosthexPlayerResponse {
  uuid: string;
  name: string;
  display_name: string;
  color_code: string;
  hex_color: string;
  boat_type: string;
  boat_material: string;
  bukkit_color: string;
}

export interface MojangProfileResponse {
  id: string; // UUID without hyphens
  name: string;
}

export interface PlayerData {
  uuid: string;
  name: string;
  colorCode?: string;
  boatType?: string;
  boatMaterial?: string;
  source: "frosthex" | "mojang";
}


/**
 * Format UUID to standard format (with hyphens)
 */
export function formatUUID(uuid: string): string {
  // Remove any existing hyphens
  const clean = uuid.replace(/-/g, "");

  // Add hyphens in standard positions: 8-4-4-4-12
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
  }

  return uuid;
}

/**
 * Validate Minecraft username (3-16 characters, alphanumeric + underscore)
 */
export function isValidMinecraftUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

/**
 * Fetch player data from Frosthex API by UUID
 * Returns null if player not found or API error
 */
export async function fetchFrosthexPlayer(
  uuid: string,
  retries = 2
): Promise<FrosthexPlayerResponse | null> {
  if (!FROSTHEX_API_KEY) {
    console.error("FROSTHEX_API_KEY not configured");
    return null;
  }

  try {
    // Ensure UUID has hyphens (format: 8-4-4-4-12)
    const formattedUUID = formatUUID(uuid);
    const url = `${FROSTHEX_BASE_URL}/players/${formattedUUID}?api_key=${FROSTHEX_API_KEY}`;

    console.log(`[FrostHex] Fetching player data: ${url.replace(FROSTHEX_API_KEY, "***")}`);

    const response = await fetch(url, {
      next: { revalidate: 60 },
    });

    console.log(`[FrostHex] Response status: ${response.status}`);

    // Retry on server errors (5xx)
    if (response.status >= 500 && response.status < 600 && retries > 0) {
      console.log(`[FrostHex] Server error ${response.status}, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
      return fetchFrosthexPlayer(uuid, retries - 1);
    }

    if (response.status === 404) {
      console.log(`[FrostHex] Player not found: ${formattedUUID}`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FrostHex] API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[FrostHex] Player found: ${data.name}`);
    return data as FrosthexPlayerResponse;
  } catch (error) {
    console.error("[FrostHex] Error fetching:", error);
    return null;
  }
}

/**
 * Fetch player profile from Mojang API by username
 * Returns null if player not found or API error
 */
export async function fetchMojangProfile(
  username: string
): Promise<MojangProfileResponse | null> {
  try {
    const encodedUsername = encodeURIComponent(username);
    const url = `${MOJANG_BASE_URL}/users/profiles/minecraft/${encodedUsername}`;

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error(`Mojang API error: ${response.status}`);
      return null;
    }

    return (await response.json()) as MojangProfileResponse;
  } catch (error) {
    console.error("Error fetching from Mojang:", error);
    return null;
  }
}

/**
 * Fetch player profile from Mojang Session Server API by UUID
 * This returns the current username for a given UUID
 * Returns null if player not found or API error
 */
export async function fetchMojangProfileByUUID(
  uuid: string
): Promise<MojangProfileResponse | null> {
  try {
    // Remove hyphens for the API
    const cleanUUID = uuid.replace(/-/g, "");
    const url = `https://sessionserver.mojang.com/session/minecraft/profile/${cleanUUID}`;

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error(`Mojang Session API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
    } as MojangProfileResponse;
  } catch (error) {
    console.error("Error fetching from Mojang Session API:", error);
    return null;
  }
}


/**
 * Fetch player data from both APIs with fallback
 * First gets UUID from Mojang (reliable), then tries Frosthex with UUID
 *
 * NOTE: This is a CLIENT-SAFE function (no database access)
 * It only queries external APIs (Mojang and Frosthex)
 */
export async function fetchPlayerData(
  username: string
): Promise<PlayerData | null> {
  // Validate username first
  if (!isValidMinecraftUsername(username)) {
    throw new Error(
      "Nome de usuário inválido. Use apenas letras, números e underscore (3-16 caracteres)."
    );
  }

  // First, get UUID from Mojang API (always reliable)
  const mojangData = await fetchMojangProfile(username);

  if (mojangData) {
    const formattedUUID = formatUUID(mojangData.id);

    // Try Frosthex with UUID (rich data)
    const frosthexData = await fetchFrosthexPlayer(formattedUUID);

    if (frosthexData) {
      return {
        uuid: formattedUUID,
        name: frosthexData.name || mojangData.name,
        colorCode: frosthexData.color_code || frosthexData.hex_color,
        boatType: frosthexData.boat_type,
        boatMaterial: frosthexData.boat_material,
        source: "frosthex",
      };
    }

    // Fallback to Mojang data (basic data only)
    return {
      uuid: formattedUUID,
      name: mojangData.name,
      source: "mojang",
    };
  }

  // Not found in Mojang API - return null
  // Note: For local database search (for players who changed names),
  // use the Server Action searchDriverByPreviousName in driverActions.ts
  return null;
}

/**
 * Fetch player data from Frosthex API using UUID directly
 * Optimized for sync operations when UUID is already known
 */
export async function fetchPlayerDataByUUID(
  uuid: string,
  currentName?: string
): Promise<PlayerData | null> {
  const formattedUUID = formatUUID(uuid);

  // Try Frosthex with UUID (rich data)
  const frosthexData = await fetchFrosthexPlayer(formattedUUID);

  if (frosthexData) {
    return {
      uuid: formattedUUID,
      name: frosthexData.name || currentName || formattedUUID,
      colorCode: frosthexData.color_code || frosthexData.hex_color,
      boatType: frosthexData.boat_type,
      boatMaterial: frosthexData.boat_material,
      source: "frosthex",
    };
  }

  // If no Frosthex data, try Mojang API to get current username
  console.log(`Frosthex API returned no data for ${formattedUUID}, trying Mojang...`);
  const mojangData = await fetchMojangProfileByUUID(formattedUUID);

  if (mojangData) {
    return {
      uuid: formattedUUID,
      name: mojangData.name,
      source: "mojang",
    };
  }

  // If neither API returned data, return null to indicate failure
  console.error(`Both Frosthex and Mojang APIs failed for UUID: ${formattedUUID}`);
  return null;
}
