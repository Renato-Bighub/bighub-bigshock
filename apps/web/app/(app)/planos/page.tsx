import { can, type Role } from "@bigstock/contracts";
import { get, getActiveOrg, getBilling } from "@/lib/server-api";
import { BillingManager, type Catalog, type InvoiceRow } from "./billing-manager";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const { org } = await getActiveOrg();
  if (!org) return null;
  const role = org.role as Role;
  const canManage = can(role, "billing:manage");
  const [summary, catalog, invoices] = await Promise.all([
    getBilling(org.id),
    get<{ data: Catalog }>("/v1/plans"),
    canManage ? get<{ data: InvoiceRow[] }>(`/v1/organizations/${org.id}/billing/invoices`) : null,
  ]);
  return (
    <div className="mx-auto max-w-5xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Planos e Créditos</h1>
      <p className="mt-1 mb-6 text-sm text-nav/60">Assinatura, créditos de IA e faturas de {org.name}.</p>
      {summary && catalog ? (
        <BillingManager orgId={org.id} canManage={canManage} summary={summary.data} catalog={catalog.data} invoices={invoices?.data ?? []} checkout={checkout ?? null} />
      ) : (
        <p className="text-sm text-nav/60">Não foi possível carregar os dados de faturação.</p>
      )}
    </div>
  );
}
