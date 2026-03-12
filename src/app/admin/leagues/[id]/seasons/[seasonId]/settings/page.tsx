import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLeagueById } from "@/lib/leagues";
import { getSeasonById } from "@/lib/leagues/seasonActions";
import { SeasonSettingsForm } from "./SeasonSettingsForm";

interface SeasonSettingsPageProps {
  params: Promise<{
    id: string;
    seasonId: string;
  }>;
}

export default async function SeasonSettingsPage({ params }: SeasonSettingsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const { id, seasonId } = await params;

  const [leagueResult, seasonResult] = await Promise.all([
    getLeagueById(id),
    getSeasonById(seasonId),
  ]);

  if (!leagueResult.success || !seasonResult.success || !leagueResult.data || !seasonResult.data) {
    notFound();
  }

  const league = leagueResult.data;
  const season = seasonResult.data;

  // Verify season belongs to league
  if (season.league.id !== id) {
    notFound();
  }

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const isOwner = league.ownerId === session.user.id;
  const isAdmin = isSuperAdmin || isOwner || league.admins.some((a) => a.user.id === session.user.id);

  if (!isAdmin) {
    redirect(`/admin/leagues/${id}/seasons/${seasonId}`);
  }

  return (
    <SeasonSettingsForm
      leagueId={id}
      seasonId={seasonId}
      season={season}
      isAdmin={isAdmin}
    />
  );
}
