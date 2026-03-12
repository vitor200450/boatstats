"use client";

import { useEffect, useState } from "react";

type HeroTypewriterProps = {
  text: string;
  className?: string;
  speedMs?: number;
  initialDelayMs?: number;
  highlightStart?: number;
  highlightClassName?: string;
};

export default function HeroTypewriter({
  text,
  className,
  speedMs = 70,
  initialDelayMs = 0,
  highlightStart,
  highlightClassName = "text-cyan-400",
}: HeroTypewriterProps) {
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    const resetTimeout = window.setTimeout(() => {
      setVisibleChars(0);
    }, 0);

    let interval: number | undefined;

    const timeout = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setVisibleChars((current) => {
          if (current >= text.length) {
            if (interval) window.clearInterval(interval);
            return current;
          }
          return current + 1;
        });
      }, speedMs);
    }, initialDelayMs);

    return () => {
      window.clearTimeout(resetTimeout);
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [initialDelayMs, speedMs, text]);

  const shownText = text.slice(0, visibleChars);
  const isComplete = visibleChars >= text.length;
  const resolvedHighlightStart =
    typeof highlightStart === "number" ? highlightStart : Number.MAX_SAFE_INTEGER;

  return (
    <span className={className} aria-label={text}>
      {shownText.split("").map((char, index) => {
        if (char === "\n") {
          return <br key={`br-${index}`} />;
        }

        return (
          <span
            key={`char-${index}`}
            className={index >= resolvedHighlightStart ? highlightClassName : undefined}
          >
            {char}
          </span>
        );
      })}
      <span
        aria-hidden="true"
        className={`ml-1 inline-block h-[0.95em] w-[2px] translate-y-[2px] bg-cyan-400 align-middle ${
          isComplete ? "opacity-0" : "opacity-100"
        }`}
      />
    </span>
  );
}
