"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import LocaleSwitcher from "@/components/LocaleSwitcher";
import DriverSearchBar from "@/components/DriverSearchBar";
import { t } from "@/i18n/messages";
import {
  addLocalePrefix,
  getLocaleFromPathname,
  parseLocaleFromPathname,
} from "@/i18n/navigation";

export default function PublicNavbar() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const normalizedPathname = parseLocaleFromPathname(pathname).pathnameWithoutLocale;

  // Helper function to check if a route is active
  const isActive = (path: string) => {
    if (path === "/") {
      return normalizedPathname === "/";
    }
    return normalizedPathname.startsWith(path);
  };

  const homeHref = addLocalePrefix("/", locale);
  const tracksHref = addLocalePrefix("/tracks", locale);
  const leaguesHref = addLocalePrefix("/leagues", locale);
  const adminLoginHref = addLocalePrefix("/admin/login", locale);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 md:h-20 flex items-center justify-between gap-4">
        <Link href={homeHref} className="flex items-center group cursor-pointer shrink-0">
          <Image
            src="/logo-icon-bs.svg"
            alt="BoatStats"
            width={40}
            height={40}
            className="h-10 w-10 object-contain md:hidden"
            priority
          />
          <Image
            src="/logo-horizontal-alt.svg"
            alt="BoatStats"
            width={560}
            height={144}
            className="hidden md:block h-11 lg:h-12 xl:h-14 w-auto -translate-y-[3px] object-contain opacity-95 group-hover:opacity-100 transition-opacity"
            priority
          />
        </Link>
        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          <Link
            className={`text-sm font-medium transition-colors ${
              isActive("/") && normalizedPathname === "/"
                ? "text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            href={homeHref}
          >
            {t(locale, "public.nav.home")}
          </Link>
          <Link
            className={`text-sm font-medium transition-colors ${
              isActive("/tracks")
                ? "text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            href={tracksHref}
          >
            {t(locale, "public.nav.tracks")}
          </Link>
          <Link
            className={`text-sm font-medium transition-colors ${
              isActive("/leagues")
                ? "text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            href={leaguesHref}
          >
            {t(locale, "public.nav.leagues")}
          </Link>
        </div>
        <div className="hidden lg:block flex-1 max-w-sm">
          <DriverSearchBar variant="navbar" />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <LocaleSwitcher />
          </div>
          <Link
            href={adminLoginHref}
            className="bg-zinc-900 border border-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-zinc-800 hover:border-cyan-500/50 transition-all"
          >
            {t(locale, "public.nav.adminLogin")}
          </Link>
        </div>
      </div>
      <div className="md:hidden border-t border-zinc-800/80 bg-zinc-950/95 px-4 py-2.5">
        <div className="flex items-center justify-center gap-6">
          <Link
            className={`text-sm font-medium transition-colors ${
              isActive("/") && normalizedPathname === "/"
                ? "text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            href={homeHref}
          >
            {t(locale, "public.nav.home")}
          </Link>
          <Link
            className={`text-sm font-medium transition-colors ${
              isActive("/tracks")
                ? "text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            href={tracksHref}
          >
            {t(locale, "public.nav.tracks")}
          </Link>
          <Link
            className={`text-sm font-medium transition-colors ${
              isActive("/leagues")
                ? "text-white"
                : "text-neutral-400 hover:text-white"
            }`}
            href={leaguesHref}
          >
            {t(locale, "public.nav.leagues")}
          </Link>
        </div>
        <div className="mt-2 flex justify-center">
          <LocaleSwitcher />
        </div>
        <div className="mt-2.5">
          <DriverSearchBar variant="navbar" />
        </div>
      </div>
    </nav>
  );
}
