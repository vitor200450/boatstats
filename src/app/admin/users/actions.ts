"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Helper to assert caller hasSUPER_ADMIN rights
async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const callingUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (callingUser?.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Super Admin access required.");
  }

  return callingUser.id;
}

export async function inviteUser(formData: FormData) {
  await requireSuperAdmin();

  const email = formData.get("email")?.toString();
  const role = formData.get("role")?.toString() as Role;

  if (!email || !role) {
    throw new Error("Missing required fields");
  }

  // Check if exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("User with this email already exists");
  }

  await prisma.user.create({
    data: {
      email,
      role,
    },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateUserRole(userId: string, newRole: Role) {
  const myUserId = await requireSuperAdmin();

  if (userId === myUserId) {
    throw new Error("You cannot change your own role.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });

  revalidatePath("/admin/users");
}

export async function removeUser(userId: string) {
  const myUserId = await requireSuperAdmin();

  if (userId === myUserId) {
    throw new Error("You cannot revoke your own access.");
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  revalidatePath("/admin/users");
}
