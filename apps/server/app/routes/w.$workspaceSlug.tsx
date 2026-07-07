import { AppShell } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Outlet, useLocation } from "react-router";

import {
  HomeIcon,
  MetricIcon,
  PlusIcon,
  QuotaIcon,
  ScopeIcon,
  SettingsIcon,
} from "~/components/icons";
import {
  listActiveWorkspaces,
  requireActiveWorkspace,
} from "~/services/workspace.server";

import type { Route } from "./+types/w.$workspaceSlug";

export async function loader({ params }: Route.LoaderArgs) {
  const [workspace, workspaces] = await Promise.all([
    requireActiveWorkspace(params.workspaceSlug),
    listActiveWorkspaces(),
  ]);

  return { workspace, workspaces };
}

export default function WorkspaceLayout({ loaderData }: Route.ComponentProps) {
  const { workspace } = loaderData;
  const { pathname } = useLocation();
  const base = `/w/${workspace.slug}`;

  return (
    <AppShell
      contentPadding={6}
      height="auto"
      sideNav={
        <SideNav
          collapsible
          header={
            <SideNavHeading
              superheading="Batuta server"
              superheadingHref="/"
              heading={workspace.name}
              headingHref={base}
              subheading="Switch workspace"
              subheadingHref="/"
            />
          }
        >
          <SideNavSection title="Configuration" isHeaderHidden>
            <SideNavItem
              label="Overview"
              icon={HomeIcon}
              href={base}
              isSelected={pathname === base}
            />
            <SideNavItem
              label="Metrics"
              icon={MetricIcon}
              href={`${base}/metrics`}
              isSelected={pathname.startsWith(`${base}/metrics`)}
            />
            <SideNavItem
              label="Scopes"
              icon={ScopeIcon}
              href={`${base}/scopes`}
              isSelected={pathname.startsWith(`${base}/scopes`)}
            />
            <SideNavItem
              label="Quotas"
              icon={QuotaIcon}
              href={`${base}/quotas`}
              isSelected={pathname.startsWith(`${base}/quotas`)}
            />
          </SideNavSection>
          <SideNavSection title="Workspace">
            <SideNavItem
              label="Settings"
              icon={SettingsIcon}
              href={`${base}/settings`}
              isSelected={pathname === `${base}/settings`}
            />
            <SideNavItem
              label="Create workspace"
              icon={PlusIcon}
              href="/workspaces/new"
            />
          </SideNavSection>
        </SideNav>
      }
    >
      <Outlet />
    </AppShell>
  );
}
