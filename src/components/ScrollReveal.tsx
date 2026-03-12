"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export default function ScrollReveal({
  children,
  className,
  delayMs = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timeout: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;

        timeout = window.setTimeout(() => {
          setIsVisible(true);
        }, delayMs);

        observer.disconnect();
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [delayMs]);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${isVisible ? "scroll-reveal-visible" : ""} ${className || ""}`}
    >
      {children}
    </div>
  );
}
