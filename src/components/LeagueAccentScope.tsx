"use client";

import { useEffect, useState } from "react";

type LeagueAccentScopeProps = {
  logoUrl: string | null;
  seed: string;
  children: React.ReactNode;
};

const accentCache = new Map<string, [number, number, number]>();

function readCachedAccent(logoUrl: string): [number, number, number] | null {
  const memory = accentCache.get(logoUrl);
  if (memory) return memory;

  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(`league-accent:${logoUrl}`);
  if (!raw) return null;

  const parsed = raw.split(",").map((value) => parseInt(value, 10));
  if (parsed.length !== 3 || parsed.some((value) => Number.isNaN(value))) {
    return null;
  }

  const color: [number, number, number] = [parsed[0], parsed[1], parsed[2]];
  accentCache.set(logoUrl, color);
  return color;
}

function persistCachedAccent(logoUrl: string, rgb: [number, number, number]): void {
  accentCache.set(logoUrl, rgb);

  if (typeof window === "undefined") return;
  window.localStorage.setItem(`league-accent:${logoUrl}`, `${rgb[0]},${rgb[1]},${rgb[2]}`);
}

function hashToRgb(seed: string): [number, number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 68;
  const lightness = 52;

  const c = (1 - Math.abs(2 * (lightness / 100) - 1)) * (saturation / 100);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness / 100 - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function extractDominantColor(image: HTMLImageElement): [number, number, number] | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const sampleSize = 24;
  canvas.width = sampleSize;
  canvas.height = sampleSize;

  ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 35) continue;

    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }

  if (count === 0) return null;

  return [
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count),
  ];
}

export function LeagueAccentScope({ logoUrl, seed, children }: LeagueAccentScopeProps) {
  const [fallbackR, fallbackG, fallbackB] = hashToRgb(seed);
  const [rgb, setRgb] = useState<[number, number, number]>([
    fallbackR,
    fallbackG,
    fallbackB,
  ]);

  useEffect(() => {
    if (!logoUrl) {
      return;
    }

    const cachedColor = readCachedAccent(logoUrl);
    if (cachedColor) {
      setRgb(cachedColor);
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(logoUrl)}`);
        if (!response.ok) {
          throw new Error("Proxy image fetch failed");
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        const image = new Image();
        image.onload = () => {
          try {
            const dominant = extractDominantColor(image);
            if (dominant && isMounted) {
              setRgb(dominant);
              persistCachedAccent(logoUrl, dominant);
            }
          } catch {
            // Keep fallback color when extraction fails.
          }
        };
        image.src = objectUrl;
      } catch {
        // Keep fallback color when proxy cannot load the image.
      }
    };

    void load();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [logoUrl]);

  return (
    <div
      style={{
        ["--league-accent-rgb" as string]: `${rgb[0]} ${rgb[1]} ${rgb[2]}`,
      }}
    >
      {children}
    </div>
  );
}
