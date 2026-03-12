"use client";

import { ReactNode, useEffect, useState } from "react";

type HeroRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export default function HeroReveal({
  children,
  className,
  delayMs = 0,
}: HeroRevealProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsVisible(true);
    }, 60 + delayMs);

    return () => window.clearTimeout(timeout);
  }, [delayMs]);

  return (
    <div className={`hero-reveal ${isVisible ? "hero-reveal-visible" : ""} ${className || ""}`}>
      {children}
    </div>
  );
}
