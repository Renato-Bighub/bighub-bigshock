import type { AiJobDto } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { HistoryList } from "./history-list";

export default async function HistoryPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const list = await get<{ data: AiJobDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${org.id}/ai/jobs?limit=24`);
  return (
    <div className="mx-auto max-w-4xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Histórico de Geração</h1>
      <p className="mt-1 mb-6 text-sm text-nav/60">Pedidos de IA de {org.name}: estado, custo e resultado. Visível apenas para a sua organização.</p>
      <HistoryList orgId={org.id} initial={list?.data ?? []} nextCursor={list?.pagination.next_cursor ?? null} />
    </div>
  );
}
