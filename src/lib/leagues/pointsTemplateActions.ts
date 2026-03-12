"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { PointsSystem } from "./pointsSystem";

export interface PointsTemplateInput {
  name: string;
  description?: string;
  pointsData: PointsSystem;
}

interface UpdatePointsTemplateInput {
  templateId: string;
  name: string;
  description?: string;
  pointsData: PointsSystem;
}

// Save a points system template
export async function savePointsTemplate(data: PointsTemplateInput) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const template = await prisma.pointsSystemTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        userId: session.user.id,
        pointsData: data.pointsData as unknown as Prisma.InputJsonValue,
      },
    });

    return { success: true, data: template };
  } catch (error) {
    console.error("Error saving points template:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao salvar template",
    };
  }
}

// Get all templates for current user
export async function getMyPointsTemplates() {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const templates = await prisma.pointsSystemTemplate.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: [
        { usageCount: "desc" },
        { updatedAt: "desc" },
      ],
    });

    return { success: true, data: templates };
  } catch (error) {
    console.error("Error fetching points templates:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar templates",
    };
  }
}

// Delete a template
export async function deletePointsTemplate(templateId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Verify ownership
    const template = await prisma.pointsSystemTemplate.findFirst({
      where: {
        id: templateId,
        userId: session.user.id,
      },
    });

    if (!template) {
      return { success: false, error: "Template não encontrado" };
    }

    await prisma.pointsSystemTemplate.delete({
      where: { id: templateId },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting points template:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar template",
    };
  }
}

// Update an existing template
export async function updatePointsTemplate(data: UpdatePointsTemplateInput) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const template = await prisma.pointsSystemTemplate.findFirst({
      where: {
        id: data.templateId,
        userId: session.user.id,
      },
    });

    if (!template) {
      return { success: false, error: "Template não encontrado" };
    }

    const updated = await prisma.pointsSystemTemplate.update({
      where: { id: data.templateId },
      data: {
        name: data.name,
        description: data.description,
        pointsData: data.pointsData as unknown as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/admin");
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating points template:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar template",
    };
  }
}

// Increment usage count when a template is used
export async function incrementTemplateUsage(templateId: string) {
  try {
    await prisma.pointsSystemTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error incrementing template usage:", error);
    return {
      success: false,
      error: "Erro ao atualizar contador de uso",
    };
  }
}
