import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import UserTable from "./UserTable";

export default async function UsersManagementPage() {
  const session = await auth();

  // Route guarding strictly for SUPER_ADMIN
  const isSuperAdmin = await prisma.user.findFirst({
    where: {
      id: session?.user?.id,
      role: "SUPER_ADMIN",
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-center bg-red-950/20 border border-red-500/30 p-8 rounded-xl backdrop-blur-sm max-w-lg">
          <span className="material-symbols-outlined text-4xl text-red-500 mb-4 block">
            gavel
          </span>
          <h1 className="text-xl font-bold font-mono text-white mb-2">
            ACCESS DENIED
          </h1>
          <p className="text-neutral-400">
            This module is restricted to Super Administrators. You do not have
            the necessary clearance to manage the global access control list.
          </p>
        </div>
      </div>
    );
  }

  // Fetch all users
  const allUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-cyan-400 text-4xl">
              shield_person
            </span>
            Access Control
          </h1>
          <p className="text-neutral-400 mt-1">
            Manage global administrators, invite new system operators, and
            assign security clearances.
          </p>
        </div>
      </div>

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl relative mt-8">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
        <UserTable users={allUsers} currentUserId={session?.user?.id ?? ""} />
      </div>
    </div>
  );
}
