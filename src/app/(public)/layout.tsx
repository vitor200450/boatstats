import { ReactNode } from "react";

import { t } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request";
import PublicNavbar from "./PublicNavbar";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();

  return (
    <div className="bg-zinc-950 text-neutral-200 font-sans min-h-screen antialiased selection:bg-cyan-500/30 selection:text-cyan-200 flex flex-col">
      <PublicNavbar />

      {/* Main Content Area */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {children}
      </main>

      <footer className="w-full border-t border-zinc-800 bg-zinc-950 py-6 mt-12">
        <p className="mx-auto max-w-7xl px-6 text-center text-sm text-zinc-400 font-mono tracking-wide">
          {t(locale, "public.footer.madeWith")}
          <svg
            aria-hidden="true"
            viewBox="0 0 7 6"
            className="mx-1.5 inline-block h-3.5 w-4 align-[-1px]"
            shapeRendering="crispEdges"
          >
            <rect x="1" y="0" width="1" height="1" fill="#22c55e" />
            <rect x="2" y="0" width="1" height="1" fill="#22c55e" />
            <rect x="4" y="0" width="1" height="1" fill="#22c55e" />
            <rect x="5" y="0" width="1" height="1" fill="#22c55e" />
            <rect x="0" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="1" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="2" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="3" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="4" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="5" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="6" y="1" width="1" height="1" fill="#22c55e" />
            <rect x="0" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="1" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="2" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="3" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="4" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="5" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="6" y="2" width="1" height="1" fill="#22c55e" />
            <rect x="1" y="3" width="1" height="1" fill="#22c55e" />
            <rect x="2" y="3" width="1" height="1" fill="#22c55e" />
            <rect x="3" y="3" width="1" height="1" fill="#22c55e" />
            <rect x="4" y="3" width="1" height="1" fill="#22c55e" />
            <rect x="5" y="3" width="1" height="1" fill="#22c55e" />
            <rect x="2" y="4" width="1" height="1" fill="#22c55e" />
            <rect x="3" y="4" width="1" height="1" fill="#22c55e" />
            <rect x="4" y="4" width="1" height="1" fill="#22c55e" />
            <rect x="3" y="5" width="1" height="1" fill="#22c55e" />
          </svg>
          by Vitor0502
        </p>
      </footer>
    </div>
  );
}
