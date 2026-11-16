import type { AiJobDto } from "@bigstock/contracts";
import { get, getActiveOrg, getBilling } from "@/lib/server-api";
import { Studio } from "./studio";
import { T } from "@/components/i18n/provider";

export default async function GeneratePage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const [billing, recent] = await Promise.all([
    getBilling(org.id),
    get<{ data: AiJobDto[] }>(`/v1/organizations/${org.id}/ai/jobs?limit=6`),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold"><T>Gerar com IA</T></h1>
      <p className="mt-1 mb-6 text-sm text-nav/60"><T>Crie imagens ou logos com IA. Verá o custo em créditos antes de confirmar.</T></p>
      <Studio orgId={org.id} initialCredits={billing?.data.credits.available ?? 0} recent={recent?.data ?? []} />
    </div>
  );
}
