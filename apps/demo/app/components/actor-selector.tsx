import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import { useNavigate } from "react-router";

import type { DemoTeam, DemoUser } from "~/lib/demo-fixtures";

export function ActorSelector({
  teams,
  team,
  user,
}: {
  teams: readonly DemoTeam[];
  team: DemoTeam;
  user: DemoUser;
}) {
  const navigate = useNavigate();

  function selectActor(teamId: string, userId?: string) {
    const search = new URLSearchParams({ team: teamId });
    if (userId) search.set("user", userId);
    navigate(`/?${search.toString()}`);
  }

  return (
    <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
      <Selector
        label="Studio team"
        value={team.id}
        options={teams.map(({ id, name }) => ({ value: id, label: name }))}
        onChange={(teamId) => selectActor(teamId)}
      />
      <Selector
        label="Creative"
        value={user.id}
        options={team.users.map(({ id, name }) => ({ value: id, label: name }))}
        onChange={(userId) => selectActor(team.id, userId)}
      />
    </Grid>
  );
}
