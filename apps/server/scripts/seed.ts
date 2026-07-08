import "dotenv/config";

import { db, pool } from "../app/data/db.server";
import { metrics, quotas, scopes, workspaces } from "../app/data/schema.server";

const ids = {
  workspaceAlpha: "00000000-0000-4000-8000-000000000001",
  workspaceBeta: "00000000-0000-4000-8000-000000000002",
  workspaceCreativeDemo: "10000000-0000-4000-8000-000000000001",
  metricCredits: "00000000-0000-4000-8000-000000000101",
  metricTokens: "00000000-0000-4000-8000-000000000102",
  metricJobs: "00000000-0000-4000-8000-000000000103",
  metricDemoCredits: "10000000-0000-4000-8000-000000000101",
  scopeUser: "00000000-0000-4000-8000-000000000201",
  scopeCompany: "00000000-0000-4000-8000-000000000202",
  scopeTeam: "00000000-0000-4000-8000-000000000203",
  scopeDemoUser: "10000000-0000-4000-8000-000000000201",
  scopeDemoTeam: "10000000-0000-4000-8000-000000000202",
  quotaDailyCredits: "00000000-0000-4000-8000-000000000301",
  quotaWeeklyCredits: "00000000-0000-4000-8000-000000000302",
  quotaHourlyJobs: "00000000-0000-4000-8000-000000000303",
  quotaDemoUserCredits: "10000000-0000-4000-8000-000000000301",
  quotaDemoTeamCredits: "10000000-0000-4000-8000-000000000302",
} as const;

async function seed() {
  await db
    .insert(workspaces)
    .values([
      { id: ids.workspaceAlpha, slug: "acme", name: "Acme" },
      { id: ids.workspaceBeta, slug: "northstar", name: "Northstar" },
      {
        id: ids.workspaceCreativeDemo,
        slug: "creative-demo",
        name: "Creative Demo",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(metrics)
    .values([
      {
        id: ids.metricCredits,
        workspaceId: ids.workspaceAlpha,
        key: "credits",
        name: "Credits",
      },
      {
        id: ids.metricTokens,
        workspaceId: ids.workspaceAlpha,
        key: "tokens",
        name: "Tokens",
      },
      {
        id: ids.metricJobs,
        workspaceId: ids.workspaceBeta,
        key: "jobs",
        name: "Jobs",
      },
      {
        id: ids.metricDemoCredits,
        workspaceId: ids.workspaceCreativeDemo,
        key: "credits",
        name: "Credits",
        description: "Credits spent by the managed-storage demo.",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(scopes)
    .values([
      {
        id: ids.scopeUser,
        workspaceId: ids.workspaceAlpha,
        key: "user",
        name: "User",
      },
      {
        id: ids.scopeCompany,
        workspaceId: ids.workspaceAlpha,
        key: "company",
        name: "Company",
      },
      {
        id: ids.scopeTeam,
        workspaceId: ids.workspaceBeta,
        key: "team",
        name: "Team",
      },
      {
        id: ids.scopeDemoUser,
        workspaceId: ids.workspaceCreativeDemo,
        key: "user",
        name: "User",
        description: "A creative working inside a demo studio.",
      },
      {
        id: ids.scopeDemoTeam,
        workspaceId: ids.workspaceCreativeDemo,
        key: "team",
        name: "Team",
        description: "A creative studio sharing a team quota.",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(quotas)
    .values([
      {
        id: ids.quotaDailyCredits,
        workspaceId: ids.workspaceAlpha,
        metricId: ids.metricCredits,
        scopeId: ids.scopeUser,
        quotaLimit: 100,
        windowAmount: 1,
        windowUnit: "day",
      },
      {
        id: ids.quotaWeeklyCredits,
        workspaceId: ids.workspaceAlpha,
        metricId: ids.metricCredits,
        scopeId: ids.scopeUser,
        quotaLimit: 500,
        windowAmount: 1,
        windowUnit: "week",
      },
      {
        id: ids.quotaHourlyJobs,
        workspaceId: ids.workspaceBeta,
        metricId: ids.metricJobs,
        scopeId: ids.scopeTeam,
        quotaLimit: 20,
        windowAmount: 1,
        windowUnit: "hour",
      },
      {
        id: ids.quotaDemoUserCredits,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoCredits,
        scopeId: ids.scopeDemoUser,
        quotaLimit: 12,
        windowAmount: 1,
        windowUnit: "minute",
      },
      {
        id: ids.quotaDemoTeamCredits,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoCredits,
        scopeId: ids.scopeDemoTeam,
        quotaLimit: 30,
        windowAmount: 1,
        windowUnit: "minute",
      },
    ])
    .onConflictDoNothing();
}

try {
  await seed();
  console.info("Development data seeded.");
} finally {
  await pool.end();
}
