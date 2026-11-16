import type { CollectionDto, LibraryAssetDto } from "@bigstock/contracts";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { get, getActiveOrg } from "@/lib/server-api";
import { CollectionDetail } from "./collection-detail";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, org } = await getActiveOrg();
  if (!org || !me) return null;
  const [col, items] = await Promise.all([
    get<{ data: CollectionDto }>(`/v1/organizations/${org.id}/collections/${encodeURIComponent(id)}`),
    get<{ data: LibraryAssetDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${org.id}/collections/${encodeURIComponent(id)}/items?limit=24`),
  ]);
  if (!col) notFound();
  const canWrite = ["owner", "admin", "member"].includes(org.role);
  const canManage = canWrite && (col.data.created_by === me.user.id || org.role === "owner" || org.role === "admin");
  return (
    <div className="mx-auto max-w-[1880px] px-[19px] pt-[18px] pb-[30px]">
      <Link href="/colecoes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-nav/60 hover:text-brand"><ChevronLeft size={16} /> Coleções</Link>
      <CollectionDetail orgId={org.id} canWrite={canWrite} canManage={canManage} collection={col.data} initial={items?.data ?? []} nextCursor={items?.pagination.next_cursor ?? null} />
    </div>
  );
}
