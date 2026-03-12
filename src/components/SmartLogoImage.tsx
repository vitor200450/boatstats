"use client";

import { useState, useEffect } from "react";
import { Trophy } from "lucide-react";

interface SmartLogoImageProps {
  src: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackIconClassName?: string;
  // Logo display settings
  scale?: number;
  posX?: number;
  posY?: number;
  // When true, fills empty space around the logo with its own background color.
  // Strategy 1: Canvas pixel sampling (exact solid color) — requires CORS headers on image server.
  // Strategy 2: CSS blurred background (no CORS required) — used as automatic fallback.
  autoBackground?: boolean;
}

export function SmartLogoImage({
  src,
  alt,
  className = "",
  fallbackClassName = "",
  fallbackIconClassName = "",
  scale = 1,
  posX = 0,
  posY = 0,
  autoBackground = false,
}: SmartLogoImageProps) {
  const [error, setError] = useState(false);
  const [bgAnalysis, setBgAnalysis] = useState<{
    src: string | null;
    detectedBg: string | null;
    useBlurFallback: boolean;
  }>({
    src: null,
    detectedBg: null,
    useBlurFallback: false,
  });

  useEffect(() => {
    if (!src || !autoBackground) return;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w === 0 || h === 0) return;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        // Sample the 4 corners — they almost always contain the background color
        const corners = [
          ctx.getImageData(0, 0, 1, 1).data,
          ctx.getImageData(w - 1, 0, 1, 1).data,
          ctx.getImageData(0, h - 1, 1, 1).data,
          ctx.getImageData(w - 1, h - 1, 1, 1).data,
        ];

        const r = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
        const g = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
        const b = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);
        const a = corners.reduce((s, c) => s + c[3], 0) / 4 / 255;

        if (a > 0.05) {
          // Solid background detected — use exact color
          setBgAnalysis({
            src,
            detectedBg: `rgba(${r},${g},${b},${a.toFixed(2)})`,
            useBlurFallback: false,
          });
          return;
        }
        setBgAnalysis({ src, detectedBg: null, useBlurFallback: false });
        // Transparent corners → no fill needed, parent bg shows through
      } catch {
        // CORS blocked — fall back to CSS blurred image background
        setBgAnalysis({ src, detectedBg: null, useBlurFallback: true });
      }
    };

    img.onerror = () => {
      // crossOrigin load rejected by server — use CSS fallback
      setBgAnalysis({ src, detectedBg: null, useBlurFallback: true });
    };

    img.src = src;
  }, [src, autoBackground]);

  if (!src || error) {
    return (
      <div className={`flex items-center justify-center ${fallbackClassName}`}>
        <Trophy className={`w-1/2 h-1/2 text-zinc-600 ${fallbackIconClassName}`} />
      </div>
    );
  }

  const detectedBg =
    autoBackground && bgAnalysis.src === src ? bgAnalysis.detectedBg : null;
  const useBlurFallback =
    autoBackground && bgAnalysis.src === src ? bgAnalysis.useBlurFallback : false;

  const transform = `scale(${scale}) translate(${posX}%, ${posY}%)`;

  return (
    <div
      className={`overflow-hidden relative ${className}`}
      style={detectedBg ? { backgroundColor: detectedBg } : undefined}
    >
      {/* CSS fallback: same image blurred and scaled to fill the container.
          For logos with a solid background color, the blur "averages" the edges
          to that color, effectively filling the letterbox areas correctly. */}
      {useBlurFallback && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            // scale(2) prevents the blur from fading at the container edges
            filter: "blur(24px)",
            transform: "scale(2)",
            transformOrigin: "center",
          }}
        />
      )}
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain transition-transform duration-200 relative z-[1]"
        style={{ transform, transformOrigin: "center center" }}
        onError={() => setError(true)}
      />
    </div>
  );
}
