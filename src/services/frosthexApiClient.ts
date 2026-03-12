export const FROSTHEX_API_BASE_URL =
  "http://fc1.api.frosthex.com/api/v1/readonly";

export const FROSTHEX_API_BASE_URL_V3 =
  "http://fc1.api.frosthex.com/api/v3/readonly";

export const FROSTHEX_API_BASE_URL_V2 =
  "http://fc1.api.frosthex.com/api/v2/readonly";

export async function fetchFrosthexAPI<T>(
  endpoint: string,
  revalidate = 60,
  suppressErrorLog = false,
): Promise<T> {
  const apiKey = process.env.FROSTHEX_API_KEY;
  const urlWithKey = apiKey
    ? `${FROSTHEX_API_BASE_URL}${endpoint}?api_key=${apiKey}`
    : `${FROSTHEX_API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(urlWithKey, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate },
    });

    if (!response.ok) {
      throw new Error(
        `Frosthex API Error: ${response.status} ${response.statusText} for URL ${FROSTHEX_API_BASE_URL}${endpoint}`,
      );
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    if (!suppressErrorLog) {
      console.error(`Error fetching from Frosthex API (${FROSTHEX_API_BASE_URL}${endpoint}):`, error);
    }
    throw error;
  }
}

export async function fetchFrosthexAPIv2<T>(endpoint: string, revalidate = 300): Promise<T> {
  const apiKey = process.env.FROSTHEX_API_KEY;
  const urlWithKey = apiKey
    ? `${FROSTHEX_API_BASE_URL_V2}${endpoint}?api_key=${apiKey}`
    : `${FROSTHEX_API_BASE_URL_V2}${endpoint}`;

  try {
    const response = await fetch(urlWithKey, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate },
    });

    if (!response.ok) {
      throw new Error(
        `Frosthex API v2 Error: ${response.status} ${response.statusText} for URL ${FROSTHEX_API_BASE_URL_V2}${endpoint}`,
      );
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching from Frosthex API v2 (${FROSTHEX_API_BASE_URL_V2}${endpoint}):`, error);
    throw error;
  }
}

export async function fetchFrosthexAPIv3<T>(endpoint: string, revalidate = 300): Promise<T> {
  const apiKey = process.env.FROSTHEX_API_KEY;
  const urlWithKey = apiKey
    ? `${FROSTHEX_API_BASE_URL_V3}${endpoint}?api_key=${apiKey}`
    : `${FROSTHEX_API_BASE_URL_V3}${endpoint}`;

  try {
    const response = await fetch(urlWithKey, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate },
    });

    if (!response.ok) {
      throw new Error(
        `Frosthex API v3 Error: ${response.status} ${response.statusText} for URL ${FROSTHEX_API_BASE_URL_V3}${endpoint}`,
      );
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching from Frosthex API v3 (${FROSTHEX_API_BASE_URL_V3}${endpoint}):`, error);
    throw error;
  }
}
