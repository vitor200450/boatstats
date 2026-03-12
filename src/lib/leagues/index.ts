// League System - Server Actions
// Re-exports all league-related server actions

// League management
export {
  createLeague,
  getMyLeagues,
  getLeagueById,
  updateLeague,
  deleteLeague,
  inviteAdmin,
  removeAdmin,
} from "./leagueActions";

// Season management
export {
  createSeason,
  getSeasons,
  getSeasonById,
  updateSeason,
  activateSeason,
  cloneSeasonForTesting,
  archiveSeason,
  deleteSeason,
  getSeasonDrivers,
  saveTeamDepthChart,
} from "./seasonActions";

// Team management
export {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  updateTeamLogoSettings,
  deleteTeam,
  assignDriverToTeam,
  assignDriverWithoutTeam,
  removeDriverFromTeam,
  transferDriver,
  getTeamAssignments,
  searchDrivers,
  getImportableTeams,
  importTeamToLeague,
} from "./teamActions";

// Driver management
export {
  createDriverFromAPI,
  createDriverManually,
  syncDriverFromAPI,
  getDriverById,
  listDrivers,
  searchDriverByPreviousName,
} from "./driverActions";

// Race management
export {
  createRace,
  getRaces,
  getRaceById,
  updateRace,
  deleteRace,
  reorderRaces,
  linkApiEvent,
  unlinkApiEvent,
  configureRound,
  saveRaceTeamRoster,
} from "./raceActions";

// Import and standings
export {
  detectRounds,
  importRoundResults,
  calculateStandings,
  recalculateStandings,
  getStandings,
  recalculatePoints,
} from "./importActions";

// Points system utilities
export {
  F1_STANDARD_POINTS,
  F1_SPRINT_POINTS,
  EVERYONE_SCORES_POINTS,
  INDYCAR_POINTS,
  PREDEFINED_POINTS_SYSTEMS,
  calculatePoints,
  validatePointsSystem,
  type PointsSystem,
} from "./pointsSystem";

// Points system templates
export {
  savePointsTemplate,
  getMyPointsTemplates,
  deletePointsTemplate,
  updatePointsTemplate,
  incrementTemplateUsage,
  type PointsTemplateInput,
} from "./pointsTemplateActions";
