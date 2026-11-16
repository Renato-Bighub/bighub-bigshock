import type { LicenseDto } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { LicenseList } from "./license-list";

export default async function DownloadsPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const list = await get<{ data: LicenseDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${org.id}/licenses?limit=24`);
  return (
    <div className="mx-auto max-w-4xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Downloads</h1>
      <p className="mt-1 mb-6 text-sm text-nav/60">Imagens licenciadas por {org.name}. Pode descarregá-las novamente quando quiser.</p>
      <LicenseList orgId={org.id} canDownload={["owner", "admin", "member"].includes(org.role)} initial={list?.data ?? []} nextCursor={list?.pagination.next_cursor ?? null} />
    </div>
  );
}
