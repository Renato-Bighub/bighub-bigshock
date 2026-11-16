import { can, type Role } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { TeamManager, type Invitation, type Member } from "./team-manager";

export default async function TeamPage() {
  const { me, org } = await getActiveOrg();
  if (!me || !org) return null;
  const role = org.role as Role;
  const [members, invitations] = await Promise.all([
    get<{ data: Member[] }>(`/v1/organizations/${org.id}/members`),
    can(role, "members:invite") ? get<{ data: Invitation[] }>(`/v1/organizations/${org.id}/invitations`) : null,
  ]);
  return (
    <div className="mx-auto max-w-4xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Equipa</h1>
      <p className="mt-1 mb-6 text-sm text-nav/60">Gestão de membros e convites de {org.name}.</p>
      <TeamManager
        orgId={org.id}
        myUserId={me.user.id}
        myRole={role}
        members={members?.data ?? []}
        invitations={invitations?.data ?? []}
      />
    </div>
  );
}
