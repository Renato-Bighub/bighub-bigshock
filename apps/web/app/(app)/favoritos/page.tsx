import type { LibraryAssetDto } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { FavoritesGrid } from "./favorites-grid";
import { T } from "@/components/i18n/provider";

export default async function FavoritesPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const list = await get<{ data: LibraryAssetDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${org.id}/favorites?limit=24`);
  return (
    <div className="mx-auto max-w-[1880px] px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold"><T>Favoritos</T></h1>
      <p className="mt-1 mb-6 text-sm text-nav/60"><T>As imagens que marcou com o coração. Só você as vê.</T></p>
      <FavoritesGrid orgId={org.id} canWrite={["owner", "admin", "member"].includes(org.role)} initial={list?.data ?? []} nextCursor={list?.pagination.next_cursor ?? null} />
    </div>
  );
}
