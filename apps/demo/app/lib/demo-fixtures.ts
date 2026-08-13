export const teams = [
  {
    id: "lumen-studio",
    name: "Lumen Studio",
    scopeValue: "lumen-studio",
    users: [
      {
        id: "maya-chen",
        name: "Maya Chen",
        scopeValue: "lumen-studio:maya-chen",
      },
      {
        id: "theo-brooks",
        name: "Theo Brooks",
        scopeValue: "lumen-studio:theo-brooks",
      },
      { id: "jun-park", name: "Jun Park", scopeValue: "lumen-studio:jun-park" },
    ],
  },
  {
    id: "paper-plane-labs",
    name: "Paper Plane Labs",
    scopeValue: "paper-plane-labs",
    users: [
      {
        id: "ina-costa",
        name: "Ina Costa",
        scopeValue: "paper-plane-labs:ina-costa",
      },
      {
        id: "omar-haddad",
        name: "Omar Haddad",
        scopeValue: "paper-plane-labs:omar-haddad",
      },
      {
        id: "sol-rivera",
        name: "Sol Rivera",
        scopeValue: "paper-plane-labs:sol-rivera",
      },
    ],
  },
] as const;

export const operations = [
  {
    id: "tune-tagline",
    name: "Tune a tagline",
    description: "Polish a compact campaign headline.",
    credits: 1,
    briefCharacters: 600,
    campaignChange: 0,
  },
  {
    id: "storyboard-launch",
    name: "Launch a storyboard campaign",
    description: "Create a campaign from a detailed creative brief.",
    credits: 3,
    briefCharacters: 2_400,
    campaignChange: 1,
  },
  {
    id: "render-campaign-film",
    name: "Launch a campaign film",
    description: "Use an extended brief for the studio hero asset.",
    credits: 10,
    briefCharacters: 6_000,
    campaignChange: 1,
  },
  {
    id: "archive-campaign",
    name: "Archive a campaign",
    description: "Close one active campaign and release its balance.",
    credits: 0,
    briefCharacters: 0,
    campaignChange: -1,
  },
] as const;

export type DemoTeam = (typeof teams)[number];
export type DemoUser = DemoTeam["users"][number];
export type DemoOperation = (typeof operations)[number];

export function findTeam(id: string): DemoTeam | undefined {
  return teams.find((team) => team.id === id);
}

export function findUserForTeam(
  team: DemoTeam,
  id: string,
): DemoUser | undefined {
  return team.users.find((user) => user.id === id);
}

export function findOperation(id: string): DemoOperation | undefined {
  return operations.find((operation) => operation.id === id);
}

export function resolveActor(teamId?: string | null, userId?: string | null) {
  const team = (teamId && findTeam(teamId)) || teams[0];
  const user = (userId && findUserForTeam(team, userId)) || team.users[0];
  return { team, user };
}
