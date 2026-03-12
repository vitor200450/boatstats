import { signIn } from "@/auth";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const locale = await getRequestLocale();
  const adminHomePath = addLocalePrefix("/admin", locale);
  const adminLoginPath = addLocalePrefix("/admin/login", locale);
  const { error } = await searchParams;

  async function login() {
    "use server";
    await signIn("discord", { redirectTo: adminHomePath });
  }

  async function debugLogin(formData: FormData) {
    "use server";
    const email = formData.get("email")?.toString();
    if (email) {
      try {
        await signIn("credentials", { email, redirectTo: adminHomePath });
      } catch (error) {
        if (error instanceof AuthError) {
          return redirect(`${adminLoginPath}?error=AccessDenied`);
        }
        throw error;
      }
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center h-full px-4">
      <div className="w-full max-w-lg">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-cyan-900/20 to-transparent pointer-events-none"></div>

          <div className="mb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="material-symbols-outlined text-4xl text-neutral-400">
                terminal
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white font-mono mb-1">
              {t(locale, "admin.login.title")}
            </h2>
            <p className="text-zinc-400 text-sm">
              {t(locale, "admin.login.subtitle")}
            </p>
          </div>

          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider font-bold text-zinc-500 font-mono mb-2">
                  {t(locale, "admin.login.authTitle")}
                </p>
                <p className="text-sm text-zinc-400 mb-4 border border-zinc-800 p-3 rounded-md bg-zinc-950/50">
                  {t(locale, "admin.login.authDescription")}
                </p>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-md text-red-400 text-sm mb-4 text-left">
                    <div className="font-bold mb-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">
                        warning
                      </span>
                      {t(locale, "admin.login.authErrorTitle")}
                    </div>
                    {error === "AccessDenied"
                      ? t(locale, "admin.login.errorAccessDenied")
                      : error === "OAuthAccountNotLinked"
                        ? t(locale, "admin.login.errorOAuthLink")
                        : t(locale, "admin.login.errorGeneric")}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-3 px-6 tracking-wide transition-all shadow-lg flex items-center justify-center gap-3 rounded-md"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 127.14 96.36"
                  fill="currentColor"
                >
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77.42,77.42,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                </svg>
                {t(locale, "admin.login.submitDiscord")}
              </button>
            </div>
          </form>

          {process.env.NODE_ENV === "development" && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs uppercase tracking-wider font-bold text-yellow-500 font-mono mb-2 text-center">
                {t(locale, "admin.login.devImpersonator")}
              </p>
              <form action={debugLogin} className="flex gap-2">
                <input
                  type="email"
                  name="email"
                  placeholder="admin@email.com"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  required
                />
                <button
                  type="submit"
                  className="bg-yellow-500/10 hover:bg-yellow-500 hover:text-black border border-yellow-500/50 text-yellow-500 font-bold px-4 py-2 rounded-md text-sm transition-colors"
                >
                  {t(locale, "admin.login.devOverride")}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
