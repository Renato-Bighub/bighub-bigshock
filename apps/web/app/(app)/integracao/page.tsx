import { can, type Role } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { ApiManager, type ApiKeyRow, type Usage } from "./api-manager";
import { T } from "@/components/i18n/provider";

export default async function IntegrationPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const role = org.role as Role;
  const canManage = can(role, "api_keys:manage");
  const [keys, usage] = await Promise.all([
    canManage ? get<{ data: ApiKeyRow[] }>(`/v1/organizations/${org.id}/api-keys`) : null,
    can(role, "usage:read") ? get<{ data: Usage }>(`/v1/organizations/${org.id}/usage`) : null,
  ]);
  return (
    <div className="mx-auto max-w-4xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold"><T>Integração via API</T></h1>
      <p className="mt-1 mb-6 text-sm text-nav/60"><T>Use o catálogo, o licenciamento e a geração por IA nos seus sistemas e websites, com a mesma conta e os mesmos créditos.</T></p>
      <ApiManager orgId={org.id} canManage={canManage} keys={keys?.data ?? []} usage={usage?.data ?? null} />
    </div>
  );
}
