import Discord from "next-auth/providers/discord";
import type { NextAuthConfig } from "next-auth";

import { parseLocaleFromPathname } from "@/i18n/navigation";

export const authConfig = {
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const normalizedPathname = parseLocaleFromPathname(nextUrl.pathname).pathnameWithoutLocale;
      const isOnAdmin = normalizedPathname.startsWith("/admin");
      const isLoginPage = normalizedPathname === "/admin/login";

      if (isOnAdmin) {
        if (isLoginPage) {
          if (isLoggedIn) {
            const localePrefix = normalizedPathname === nextUrl.pathname
              ? ""
              : nextUrl.pathname.replace(normalizedPathname, "");
            return Response.redirect(new URL(`${localePrefix}/admin`, nextUrl));
          }
          return true; // allow access to login page
        }
        if (!isLoggedIn) return false; // redirect unauthenticated users to login page
        return true;
      }
      return true; // allow access to non-admin routes
    },
    // Populate session with user info on requests
    async session({ session, token }) {
      if (token?.sub && session.user) {
        session.user.id = token.sub;
        session.user.name = token.name as string | null | undefined;
        session.user.image = token.picture as string | null | undefined;
        session.user.role = token.role as string | null | undefined;
      }
      return session;
    },
    // We just map the sub because DB fetching is handled via Prisma on the Node runtime.
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || token.role;
      }
      return token;
    },
  },
} satisfies NextAuthConfig;
