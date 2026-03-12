import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

const devProviders =
  process.env.NODE_ENV === "development"
    ? [
        Credentials({
          name: "Impersonator",
          credentials: {
            email: { label: "Email", type: "email" },
          },
          async authorize(credentials) {
            if (!credentials?.email) return null;
            const user = await prisma.user.findUnique({
              where: { email: credentials.email as string },
            });
            if (!user) throw new Error("User not found in Dev DB");

            let activeUser = user;
            if (!activeUser.name) {
              activeUser = await prisma.user.update({
                where: { id: user.id },
                data: {
                  name: `Test-${user.email!.split("@")[0]}`,
                  image: `https://ui-avatars.com/api/?name=${user.email!.split("@")[0]}&background=random`,
                },
              });
            }

            return {
              id: activeUser.id,
              name: activeUser.name,
              email: activeUser.email,
              image: activeUser.image,
              role: activeUser.role,
            };
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...devProviders],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    // We intercept sign in logic to ensure ONLY invited users can use the panel
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      // Check if user is in our database with an Admin role
      // This enforces the "Invite-Only" Tenant functionality.
      try {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (
          existingUser &&
          (existingUser.role === "ADMIN" || existingUser.role === "SUPER_ADMIN")
        ) {
          // Forcefully sync the latest Discord data ONLY if logging in via Discord
          if (account?.provider === "discord") {
            const newName =
              (profile?.global_name as string) ||
              (profile?.username as string) ||
              user.name ||
              "Admin";
            const newImage =
              user.image || (profile?.image_url as string) || null;

            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                name: newName,
                image: newImage,
              },
            });
          }

          return true; // Approved
        }

        // If user is not in database or not admin, reject sign in.
        return false;
      } catch (error) {
        console.error("Error during sign in query:", error);
        return false;
      }
    },
    async jwt({ token, user, trigger }) {
      // Run the base JWT mapping
      if (authConfig.callbacks?.jwt) {
        token = await authConfig.callbacks.jwt({ token, user, trigger });
      }

      // Because NextAuth fetches the User BEFORE the signIn callback runs,
      // the token might miss the newly synced `name`, `image`, and `role`.
      // We lazily load it from DB here once if missing:
      if (token.sub && (!token.name || !token.picture || !token.role)) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { name: true, image: true, role: true },
        });
        if (dbUser) {
          token.name = dbUser.name;
          token.picture = dbUser.image;
          token.role = dbUser.role;
        }
      }

      // Always ensure role is populated from DB for DEV IMPERSONATOR
      // This fixes the case where role was not returned in credentials provider
      if (token.sub && !token.role) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        });
        if (dbUser?.role) {
          token.role = dbUser.role;
        }
      }

      return token;
    },
  },
});
