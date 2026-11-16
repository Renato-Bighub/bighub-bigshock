import type { AiJobDto } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { HistoryList } from "./history-list";
import { T } from "@/components/i18n/provider";

export default async function HistoryPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const list = await get<{ data: AiJobDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${org.id}/ai/jobs?limit=24`);
  return (
    <div className="mx-auto max-w-4xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold"><T>Histórico de Geração</T></h1>
      <p className="mt-1 mb-6 text-sm text-nav/60"><T>Pedidos de IA de</T> {org.name}<T>: estado, custo e resultado. Visível apenas para a sua organização.</T></p>
      <HistoryList orgId={org.id} initial={list?.data ?? []} nextCursor={list?.pagination.next_cursor ?? null} />
    </div>
  );
}
