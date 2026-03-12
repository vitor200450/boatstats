import { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { auth } from "@/auth";
import { AdminChecklistToast } from "@/components/admin/AdminChecklistToast";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { addLocalePrefix } from "@/i18n/navigation";
import { t } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request";
import { getAdminChecklistSummary } from "@/lib/adminChecklistSummary";

import AdminSidebar from "./AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getRequestLocale();

  // Read session from Auth.js
  const session = await auth();
  const isAuthenticated = !!session?.user;

  // Extract user details or fallbacks
  const userName = session?.user?.name || t(locale, "admin.topbar.fallbackUser");
  const userInitials = userName.substring(0, 2).toUpperCase();
  const userImage = session?.user?.image;
  const userRole = session?.user?.role || "ADMIN";
  const checklistSummary = isAuthenticated ? await getAdminChecklistSummary() : null;

  return (
    <div className="bg-neutral-950 text-neutral-200 font-sans antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">
      <nav className="fixed top-0 left-0 right-0 z-50 w-full border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-md">
        <div className="w-full px-6 h-16 flex items-center justify-between">
            <Link
              href={addLocalePrefix("/", locale)}
              className="flex items-center gap-2 group cursor-pointer w-64"
            >
            <span className="material-symbols-outlined text-neutral-400 group-hover:text-cyan-400 transition-colors">
              terminal
            </span>
            <span className="font-bold tracking-tight text-white font-mono">
              {t(locale, "admin.topbar.title")}
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 flex-1 justify-end mr-6">
            <LocaleSwitcher />
          </div>
          {isAuthenticated && (
            <div className="flex items-center gap-4 border-l border-neutral-800 pl-6 h-full">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-xs font-mono text-neutral-400 overflow-hidden relative">
                  {userImage ? (
                    <Image
                      src={userImage}
                      alt={userName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    userInitials
                  )}
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm font-bold text-white leading-none flex items-center gap-2">
                    {userName}
                  </div>
                  <div className="mt-1">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest leading-none ${
                        userRole === "SUPER_ADMIN"
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                      }`}
                    >
                      {userRole}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="flex min-h-screen pt-16">
        <AdminSidebar />

        <main className="flex-1 bg-neutral-950 p-6 md:p-10">
          {children}
        </main>
      </div>
      {checklistSummary && <AdminChecklistToast summary={checklistSummary} />}
    </div>
  );
}
