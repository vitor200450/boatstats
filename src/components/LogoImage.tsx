"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";

interface LogoImageProps {
  src: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackIconClassName?: string;
}

export function LogoImage({ src, alt, className = "", fallbackClassName = "", fallbackIconClassName = "" }: LogoImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className={`flex items-center justify-center ${fallbackClassName}`}>
        <Trophy className={`w-1/2 h-1/2 text-zinc-600 ${fallbackIconClassName}`} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}
