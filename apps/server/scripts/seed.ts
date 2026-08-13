import "dotenv/config";

import { eq } from "drizzle-orm";

import { db, pool } from "../app/data/db.server";
import { metrics, quotas, scopes, workspaces } from "../app/data/schema.server";

const ids = {
  workspaceAlpha: "00000000-0000-4000-8000-000000000001",
  workspaceBeta: "00000000-0000-4000-8000-000000000002",
  workspaceCreativeDemo: "10000000-0000-4000-8000-000000000001",
  metricCredits: "00000000-0000-4000-8000-000000000101",
  metricTokens: "00000000-0000-4000-8000-000000000102",
  metricJobs: "00000000-0000-4000-8000-000000000103",
  metricLessons: "00000000-0000-4000-8000-000000000104",
  metricPromptCharacters: "00000000-0000-4000-8000-000000000105",
  metricDemoCredits: "10000000-0000-4000-8000-000000000101",
  metricDemoCampaigns: "10000000-0000-4000-8000-000000000102",
  metricDemoBriefCharacters: "10000000-0000-4000-8000-000000000103",
  scopeUser: "00000000-0000-4000-8000-000000000201",
  scopeCompany: "00000000-0000-4000-8000-000000000202",
  scopeTeam: "00000000-0000-4000-8000-000000000203",
  scopeDemoUser: "10000000-0000-4000-8000-000000000201",
  scopeDemoTeam: "10000000-0000-4000-8000-000000000202",
  quotaDailyCredits: "00000000-0000-4000-8000-000000000301",
  quotaWeeklyCredits: "00000000-0000-4000-8000-000000000302",
  quotaHourlyJobs: "00000000-0000-4000-8000-000000000303",
  quotaActiveLessons: "00000000-0000-4000-8000-000000000304",
  quotaPromptCharacters: "00000000-0000-4000-8000-000000000305",
  quotaUnlimitedCreditsOverride: "00000000-0000-4000-8000-000000000306",
  quotaDemoUserCredits: "10000000-0000-4000-8000-000000000301",
  quotaDemoTeamCredits: "10000000-0000-4000-8000-000000000302",
  quotaDemoCampaigns: "10000000-0000-4000-8000-000000000303",
  quotaDemoBriefCharacters: "10000000-0000-4000-8000-000000000304",
  quotaDemoExtendedBrief: "10000000-0000-4000-8000-000000000305",
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

  // Stable IDs let reseeding carry renamed demo keys forward without
  // replacing their quotas or usage history.
  await db
    .update(metrics)
    .set({ key: "campaigns.active" })
    .where(eq(metrics.id, ids.metricDemoCampaigns));
  await db
    .update(metrics)
    .set({ key: "brief.characters" })
    .where(eq(metrics.id, ids.metricDemoBriefCharacters));

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
        id: ids.metricLessons,
        workspaceId: ids.workspaceAlpha,
        key: "active_lessons",
        name: "Active lessons",
      },
      {
        id: ids.metricPromptCharacters,
        workspaceId: ids.workspaceAlpha,
        key: "prompt_characters",
        name: "Prompt characters",
      },
      {
        id: ids.metricDemoCredits,
        workspaceId: ids.workspaceCreativeDemo,
        key: "credits",
        name: "Credits",
        description: "Credits spent by the managed-storage demo.",
      },
      {
        id: ids.metricDemoCampaigns,
        workspaceId: ids.workspaceCreativeDemo,
        key: "campaigns.active",
        name: "Active campaigns",
        description: "Persistent campaigns launched by a creative.",
      },
      {
        id: ids.metricDemoBriefCharacters,
        workspaceId: ids.workspaceCreativeDemo,
        key: "brief.characters",
        name: "Brief characters",
        description: "Direct character limit for one creative brief.",
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
        type: "rolling",
        quotaLimit: 100,
        windowAmount: 1,
        windowUnit: "day",
      },
      {
        id: ids.quotaWeeklyCredits,
        workspaceId: ids.workspaceAlpha,
        metricId: ids.metricCredits,
        scopeId: ids.scopeUser,
        type: "rolling",
        quotaLimit: 500,
        windowAmount: 1,
        windowUnit: "week",
      },
      {
        id: ids.quotaHourlyJobs,
        workspaceId: ids.workspaceBeta,
        metricId: ids.metricJobs,
        scopeId: ids.scopeTeam,
        type: "rolling",
        quotaLimit: 20,
        windowAmount: 1,
        windowUnit: "hour",
      },
      {
        id: ids.quotaDemoUserCredits,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoCredits,
        scopeId: ids.scopeDemoUser,
        type: "rolling",
        quotaLimit: 12,
        windowAmount: 1,
        windowUnit: "minute",
      },
      {
        id: ids.quotaDemoTeamCredits,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoCredits,
        scopeId: ids.scopeDemoTeam,
        type: "rolling",
        quotaLimit: 30,
        windowAmount: 1,
        windowUnit: "minute",
      },
      {
        id: ids.quotaDemoCampaigns,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoCampaigns,
        scopeId: ids.scopeDemoUser,
        type: "balance",
        quotaLimit: 2,
      },
      {
        id: ids.quotaDemoBriefCharacters,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoBriefCharacters,
        scopeId: ids.scopeDemoUser,
        type: "direct",
        quotaLimit: 4_000,
      },
      {
        id: ids.quotaDemoExtendedBrief,
        workspaceId: ids.workspaceCreativeDemo,
        metricId: ids.metricDemoBriefCharacters,
        scopeId: ids.scopeDemoUser,
        scopeValue: "lumen-studio:maya-chen",
        type: "direct",
        quotaLimit: 8_000,
      },
      {
        id: ids.quotaActiveLessons,
        workspaceId: ids.workspaceAlpha,
        metricId: ids.metricLessons,
        scopeId: ids.scopeUser,
        type: "balance",
        quotaLimit: 10,
      },
      {
        id: ids.quotaPromptCharacters,
        workspaceId: ids.workspaceAlpha,
        metricId: ids.metricPromptCharacters,
        scopeId: ids.scopeUser,
        type: "direct",
        quotaLimit: 4_000,
      },
      {
        id: ids.quotaUnlimitedCreditsOverride,
        workspaceId: ids.workspaceAlpha,
        metricId: ids.metricCredits,
        scopeId: ids.scopeUser,
        scopeValue: "user-unlimited",
        type: "rolling",
        quotaLimit: null,
        windowAmount: 1,
        windowUnit: "day",
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
