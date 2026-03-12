import { z } from "zod";

const dbIdSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^[a-z0-9]{24,}$/i.test(value) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    { message: "ID inválido" },
  );

// Points system validation
const pointsSystemSchema = z.object({
  name: z.string().min(1),
  positions: z.record(z.string(), z.number().int().min(0)),
  bonuses: z.object({
    fastestLap: z.number().int().min(0).optional(),
    polePosition: z.number().int().min(0).optional(),
    mostLapsLed: z.number().int().min(0).optional(),
    positionsGained: z
      .object({
        threshold: z.number().int().min(1),
        points: z.number().int().min(0),
      })
      .optional(),
    finishRace: z.number().int().min(0).optional(),
  }),
  rules: z.object({
    dropLowestScores: z.number().int().min(0).optional(),
    requireFinishToScore: z.boolean().optional(),
    configuredByAdmin: z.boolean().optional(),
    teamScoringMode: z
      .enum(["STANDARD", "DEPTH_CHART", "SLOT_MULLIGAN"])
      .optional(),
    driverMulliganCount: z.number().int().min(0).optional(),
    teamSlotMulliganCount: z.number().int().min(0).optional(),
    reverseGridEnabled: z.boolean().optional(),
    reverseGridPointsTable: z
      .record(z.string(), z.number().int().min(0))
      .optional(),
  }),
});

const sprintConfigSchema = z.object({
  defaultMode: z.enum(["CLASSIFICATION", "POINTS"]),
  pointsSystem: pointsSystemSchema.optional(),
});

// League schemas
export const createLeagueSchema = z.object({
  name: z.string().min(1, "Nome da liga é obrigatório"),
  description: z.string().optional(),
  logoUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  seasonName: z.string().min(1, "Nome da temporada é obrigatório"),
});

export const updateLeagueSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  logoUrl: z.string().url("URL inválida").optional().or(z.literal("")),
});

// Season schemas
export const createSeasonSchema = z.object({
  name: z.string().min(1, "Nome da temporada é obrigatório"),
  year: z.number().int().min(2020).max(2100).optional(),
  pointsSystem: pointsSystemSchema,
  sprintConfig: sprintConfigSchema.optional(),
});

export const updateSeasonSchema = z.object({
  name: z.string().min(1).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  pointsSystem: pointsSystemSchema.optional(),
  sprintConfig: sprintConfigSchema.optional(),
});

// Team schemas
export const createTeamSchema = z.object({
  name: z.string().min(1, "Nome da equipe é obrigatório"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser um hex válido (ex: #FF0000)")
    .optional(),
  logoUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  logoScale: z.number().min(0.5).max(3).optional(),
  logoPosX: z.number().min(-50).max(50).optional(),
  logoPosY: z.number().min(-50).max(50).optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

// Driver assignment schemas
export const assignDriverSchema = z.object({
  driverId: z.string().cuid(),
  teamId: z.string().cuid(),
});

// Race schemas
export const createRaceSchema = z.object({
  name: z.string().min(1, "Nome da corrida é obrigatório"),
  round: z.number().int().min(1, "Rodada deve ser maior que 0"),
  trackApiName: z.string().optional(),
  scheduledDate: z.string().datetime().optional(),
  reverseGridEnabled: z.boolean().optional(),
});

export const updateRaceSchema = createRaceSchema.partial();

// Event round configuration
export const configureRoundSchema = z.object({
  targetHeatName: z.string().optional(),
  pointsSystem: pointsSystemSchema.optional().nullable(),
  countsForStandings: z.boolean().optional(),
  specialType: z.enum(["NONE", "SPRINT"]).optional(),
  sprintMode: z.enum(["CLASSIFICATION", "POINTS"]).nullable().optional(),
});

export const manualFinalRoundEditSchema = z.object({
  eventRoundId: dbIdSchema,
  reason: z.string().trim().max(300).optional(),
  positions: z
    .array(
      z.object({
        roundResultId: z.string().cuid(),
        position: z.number().int().min(1),
      }),
    )
    .min(1),
});

export const createManualFinalRoundSchema = z.object({
  raceId: z.string().cuid(),
  baseRoundId: z.string().cuid().optional(),
});

export const addManualRoundDriverSchema = z.object({
  eventRoundId: dbIdSchema,
  uuid: z.string().trim().min(3).max(64),
  name: z.string().trim().min(1).max(64),
});

// Types inferred from schemas
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;
export type CreateRaceInput = z.infer<typeof createRaceSchema>;
export type UpdateRaceInput = z.infer<typeof updateRaceSchema>;
export type ConfigureRoundInput = z.infer<typeof configureRoundSchema>;
export type ManualFinalRoundEditInput = z.infer<typeof manualFinalRoundEditSchema>;
export type CreateManualFinalRoundInput = z.infer<typeof createManualFinalRoundSchema>;
export type AddManualRoundDriverInput = z.infer<typeof addManualRoundDriverSchema>;
