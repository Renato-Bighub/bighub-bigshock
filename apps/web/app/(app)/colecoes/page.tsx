import type { CollectionDto } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { CollectionsManager } from "./collections-manager";

export default async function CollectionsPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const list = await get<{ data: CollectionDto[] }>(`/v1/organizations/${org.id}/collections`);
  return (
    <div className="mx-auto max-w-[1880px] px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Coleções</h1>
      <p className="mt-1 mb-6 text-sm text-nav/60">Agrupe imagens por projeto. As coleções são partilhadas com toda a equipa de {org.name}.</p>
      <CollectionsManager orgId={org.id} canWrite={["owner", "admin", "member"].includes(org.role)} initial={list?.data ?? []} />
    </div>
  );
}
