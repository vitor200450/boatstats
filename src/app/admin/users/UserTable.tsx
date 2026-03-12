"use client";

import { User } from "@prisma/client";
import Image from "next/image";
import { useState } from "react";
import InviteAdminModal from "./InviteAdminModal";
import CustomConfirmModal from "./CustomConfirmModal";
import { updateUserRole, removeUser } from "./actions";

export default function UserTable({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive: boolean;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isDestructive: false,
    action: async () => {},
  });

  const closeConfirm = () =>
    setConfirmState((prev) => ({ ...prev, isOpen: false }));

  return (
    <>
      <div className="p-4 border-b border-neutral-800 bg-neutral-900 flex justify-between items-center">
        <h2 className="text-sm font-bold text-neutral-300 font-mono tracking-wider">
          ACTIVE ADMINISTRATORS
        </h2>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-neutral-950 transition-colors px-4 py-2 rounded font-mono text-xs font-bold uppercase flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">
            person_add
          </span>
          Invite Admin
        </button>
      </div>

      <div className="overflow-x-auto min-h-[500px]">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-neutral-950/50 text-xs text-neutral-500 font-mono tracking-wider">
              <th className="p-4 font-normal w-[36%]">USER</th>
              <th className="p-4 font-normal w-[34%]">EMAIL</th>
              <th className="p-4 font-normal w-[14%]">ROLE</th>
              <th className="p-4 font-normal w-[16%] text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {users.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-neutral-800/30 transition-colors group"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700 relative flex items-center justify-center text-xs font-mono text-neutral-500">
                      {user.image ? (
                        <Image
                          src={user.image}
                          alt={user.name || "User"}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        user.name?.substring(0, 2).toUpperCase() || "?"
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">
                        {user.name || "Pending Invite"}
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">
                        {user.id.substring(0, 8)}...
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-sm text-neutral-300 truncate">{user.email}</td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold tracking-widest ${
                      user.role === "SUPER_ADMIN"
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        : "bg-neutral-800 text-neutral-300 border border-neutral-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Cannot demote or block yourself in the UI easily to prevent lockouts */}
                    {user.id !== currentUserId && (
                      <>
                        <button
                          onClick={() => {
                            const newRole =
                              user.role === "ADMIN" ? "SUPER_ADMIN" : "ADMIN";
                            setConfirmState({
                              isOpen: true,
                              title: "CHANGE CLEARANCE",
                              message: `Are you sure you want to change ${user.email}'s clearance to ${newRole}?`,
                              isDestructive: false,
                              action: async () => {
                                await updateUserRole(user.id, newRole);
                              },
                            });
                          }}
                          className="text-neutral-500 hover:text-white p-2 rounded hover:bg-neutral-800 transition-colors"
                          title="Toggle Role"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            manage_accounts
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setConfirmState({
                              isOpen: true,
                              title: "REVOKE ACCESS",
                              message: `Are you sure you want to permanently revoke system access for ${user.email}?`,
                              isDestructive: true,
                              action: async () => {
                                await removeUser(user.id);
                              },
                            });
                          }}
                          className="text-neutral-500 hover:text-red-400 p-2 rounded hover:bg-red-500/10 transition-colors"
                          title="Revoke Access"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            block
                          </span>
                        </button>
                      </>
                    )}
                    {user.id === currentUserId && (
                      <span className="text-xs text-neutral-600 font-mono tracking-widest px-2 py-1">
                        YOU
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="p-8 text-center text-neutral-500 font-mono text-sm"
                >
                  No administrators found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <InviteAdminModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />

      <CustomConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.isDestructive}
        onConfirm={confirmState.action}
        onClose={closeConfirm}
      />
    </>
  );
}
