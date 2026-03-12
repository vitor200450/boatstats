"use server";

import { revalidatePath } from "next/cache";

import { getEventResults } from "@/services/frosthexAPI";
import { prisma } from "@/lib/prisma";
import { calculatePoints } from "@/lib/pointsEngine";

export async function importEventData(leagueId: string, apiEventId: string) {
  try {
    // 1. Fetch JSON from external API
    const eventData = await getEventResults(apiEventId);

    if (!eventData || !eventData.rounds || eventData.rounds.length === 0) {
      throw new Error("Invalid or empty event data received.");
    }

    // Determine target heat (usually the final/last heat config)
    // Here we find the first HEAT in a RACE round as a simple heuristic for MVP
    let targetHeat = null;
    for (const round of eventData.rounds) {
      if (round.type === "RACE" && round.heats.length > 0) {
        targetHeat = round.heats[round.heats.length - 1]; // Often the "Grand Final"
      }
    }

    // Fallback if no specific "RACE" round is found, try first available heat
    if (!targetHeat && eventData.rounds[0].heats.length > 0) {
      targetHeat = eventData.rounds[0].heats[0];
    }

    if (!targetHeat) {
      throw new Error("Could not find a valid racing heat in the event data.");
    }

    // 2. Fetch the League config to get custom Point System
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });

    if (!league) {
      throw new Error("League not found.");
    }

    // Legacy points system support removed - using default F1 points
    const pointsSystem = undefined;

    // Use transaction to ensure either everything exports or nothing does
    await prisma.$transaction(async (tx) => {
      // Track UPSERT (Create if new track)
      const track = await tx.track.upsert({
        where: { apiName: eventData.track_name },
        update: { name: eventData.track_name },
        create: { apiName: eventData.track_name, name: eventData.track_name },
      });

      // Event UPSERT (Mark as pending to imported)
      const event = await tx.event.upsert({
        where: { apiEventId: apiEventId },
        update: {
          status: "IMPORTED",
          trackId: track.id,
          name: eventData.name,
          date: new Date(eventData.date * 1000),
        },
        create: {
          apiEventId: apiEventId,
          leagueId: league.id,
          status: "IMPORTED",
          trackId: track.id,
          name: eventData.name,
          date: new Date(eventData.date * 1000),
        },
      });

      // Process each driver's outcome in the heat
      for (const dr of targetHeat.driver_results) {
        // Upsert Driver
        const driver = await tx.driver.upsert({
          where: { uuid: dr.uuid },
          update: { currentName: dr.name },
          create: { uuid: dr.uuid, currentName: dr.name },
        });

        // Determine fastest lap specifically for this driver
        let playerFastest = false;
        for (const lap of dr.laps) {
          if (lap.fastest) playerFastest = true;
        }

        // Calculate points
        const earnedPoints = calculatePoints(
          dr.position,
          playerFastest,
          pointsSystem,
        );

        // Upsert Result
        await tx.result.upsert({
          where: {
            eventId_driverId: {
              eventId: event.id,
              driverId: driver.id,
            },
          },
          update: {
            position: dr.position,
            startPosition: dr.start_position,
            timeMs: dr.finish_time,
            fastestLap: playerFastest,
            points: earnedPoints,
          },
          create: {
            eventId: event.id,
            driverId: driver.id,
            position: dr.position,
            startPosition: dr.start_position,
            timeMs: dr.finish_time,
            fastestLap: playerFastest,
            points: earnedPoints,
          },
        });
      }
    });

    // Invalidate caches so public portal sees the new data
    revalidatePath(`/(public)`);
    revalidatePath(`/admin/dashboard`);

    return {
      success: true,
      message: `Event ${apiEventId} imported successfully.`,
    };
  } catch (error: unknown) {
    console.error("Error importing event:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "An unknown error occurred during import.",
    };
  }
}
