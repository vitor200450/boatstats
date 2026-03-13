"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { addLocalePrefix, getLocaleFromPathname, parseLocaleFromPathname } from "@/i18n/navigation";

type AdminSidebarProps = {
  userRole: string;
};

export default function AdminSidebar({ userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const normalizedPathname = parseLocaleFromPathname(pathname).pathnameWithoutLocale;

  const adminHomeHref = addLocalePrefix("/admin", locale);
  const leaguesHref = addLocalePrefix("/admin/leagues", locale);
  const usersHref = addLocalePrefix("/admin/users", locale);
  const loginHref = addLocalePrefix("/admin/login", locale);
  const isSuperAdmin = userRole === "SUPER_ADMIN";

  const isActive = (path: string) => {
    if (path === "/admin") {
      return normalizedPathname === "/admin";
    }
    return normalizedPathname.startsWith(path);
  };

  return (
    <>
      <div className="hidden md:block w-64 shrink-0" aria-hidden="true" />
      <aside className="hidden md:flex fixed top-16 left-0 w-64 h-[calc(100dvh-4rem)] bg-neutral-900 border-r border-neutral-800 flex-col">
        <div className="p-6">
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 font-mono">
            Navegação
          </div>
          <nav className="space-y-1">
            <Link
              href={adminHomeHref}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive("/admin")
                  ? "text-white bg-neutral-800/80"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              }`}
            >
              <span
                className={`material-symbols-outlined text-lg ${isActive("/admin") ? "text-cyan-400" : ""}`}
              >
                dashboard
              </span>
              Início
            </Link>
            <Link
              href={leaguesHref}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive("/admin/leagues")
                  ? "text-white bg-neutral-800/80"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
              }`}
            >
              <span
                className={`material-symbols-outlined text-lg ${isActive("/admin/leagues") ? "text-cyan-400" : ""}`}
              >
                trophy
              </span>
              Ligas
            </Link>
          </nav>
        </div>
        <div className="mt-auto p-6 border-t border-neutral-800">
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 font-mono">
            Administração
          </div>
          <nav className="space-y-1">
            {isSuperAdmin && (
              <Link
                href={usersHref}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive("/admin/users")
                    ? "text-white bg-neutral-800/80"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-lg ${isActive("/admin/users") ? "text-cyan-400" : ""}`}
                >
                  shield_person
                </span>
                Acesso de usuários
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: loginHref })}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800/50 rounded-md transition-colors"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Sair
            </button>
          </nav>
        </div>
      </aside>
    </>
  );
}
