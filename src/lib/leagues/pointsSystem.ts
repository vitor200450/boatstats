// Points System Types and Defaults for League System

export type TeamScoringMode = "STANDARD" | "DEPTH_CHART" | "SLOT_MULLIGAN";

export interface PointsSystem {
  name: string;
  positions: Record<string, number>;
  bonuses: {
    fastestLap?: number;
    polePosition?: number;
    mostLapsLed?: number;
    positionsGained?: { threshold: number; points: number };
    finishRace?: number;
  };
  rules: {
    dropLowestScores?: number;
    requireFinishToScore?: boolean;
    configuredByAdmin?: boolean;
    teamScoringMode?: TeamScoringMode;
    driverMulliganCount?: number;
    teamSlotMulliganCount?: number;
    reverseGridEnabled?: boolean;
    reverseGridPointsTable?: Record<string, number>;
  };
}

// F1 Standard (25-18-15-12-10-8-6-4-2-1 + 1 FL)
export const F1_STANDARD_POINTS: PointsSystem = {
  name: "F1 Standard",
  positions: {
    "1": 25,
    "2": 18,
    "3": 15,
    "4": 12,
    "5": 10,
    "6": 8,
    "7": 6,
    "8": 4,
    "9": 2,
    "10": 1,
  },
  bonuses: {
    fastestLap: 1,
  },
  rules: {},
};

// F1 Sprint (8-7-6-5-4-3-2-1)
export const F1_SPRINT_POINTS: PointsSystem = {
  name: "F1 Sprint",
  positions: {
    "1": 8,
    "2": 7,
    "3": 6,
    "4": 5,
    "5": 4,
    "6": 3,
    "7": 2,
    "8": 1,
  },
  bonuses: {},
  rules: {},
};

// Everyone Scores (40-35-34-33-32...)
export const EVERYONE_SCORES_POINTS: PointsSystem = {
  name: "Everyone Scores",
  positions: {
    "1": 40,
    "2": 35,
    "3": 34,
    "4": 33,
    "5": 32,
    "6": 31,
    "7": 30,
    "8": 29,
    "9": 28,
    "10": 27,
    "11": 26,
    "12": 25,
    "13": 24,
    "14": 23,
    "15": 22,
    "16": 21,
    "17": 20,
    "18": 19,
    "19": 18,
    "20": 17,
  },
  bonuses: {
    polePosition: 1,
    fastestLap: 1,
  },
  rules: {
    dropLowestScores: 2,
  },
};

// IndyCar style
export const INDYCAR_POINTS: PointsSystem = {
  name: "IndyCar",
  positions: {
    "1": 50,
    "2": 40,
    "3": 35,
    "4": 32,
    "5": 30,
    "6": 28,
    "7": 26,
    "8": 24,
    "9": 22,
    "10": 20,
    "11": 19,
    "12": 18,
    "13": 17,
    "14": 16,
    "15": 15,
    "16": 14,
    "17": 13,
    "18": 12,
    "19": 11,
    "20": 10,
    "21": 9,
    "22": 8,
    "23": 7,
    "24": 6,
    "25": 5,
    "26": 4,
    "27": 3,
    "28": 2,
    "29": 1,
    "30": 1,
  },
  bonuses: {
    polePosition: 1,
    mostLapsLed: 1,
  },
  rules: {},
};

export const PREDEFINED_POINTS_SYSTEMS: PointsSystem[] = [
  F1_STANDARD_POINTS,
  F1_SPRINT_POINTS,
  EVERYONE_SCORES_POINTS,
  INDYCAR_POINTS,
];

export function calculatePoints(
  position: number,
  hasFastestLap: boolean,
  hasPolePosition: boolean,
  pointsSystem: PointsSystem
): number {
  let points = 0;

  // Position points
  const positionStr = position.toString();
  if (pointsSystem.positions[positionStr]) {
    points += pointsSystem.positions[positionStr];
  }

  // Bonuses
  if (hasFastestLap && pointsSystem.bonuses.fastestLap) {
    points += pointsSystem.bonuses.fastestLap;
  }

  if (hasPolePosition && pointsSystem.bonuses.polePosition) {
    points += pointsSystem.bonuses.polePosition;
  }

  return points;
}

export function validatePointsSystem(system: unknown): system is PointsSystem {
  if (typeof system !== "object" || system === null) return false;

  const s = system as Partial<PointsSystem>;

  if (typeof s.name !== "string") return false;
  if (typeof s.positions !== "object" || s.positions === null) return false;
  if (typeof s.bonuses !== "object" || s.bonuses === null) return false;
  if (typeof s.rules !== "object" || s.rules === null) return false;

  return true;
}
