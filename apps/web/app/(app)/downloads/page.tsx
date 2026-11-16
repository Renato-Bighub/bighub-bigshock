import type { LicenseDto } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { LicenseList } from "./license-list";
import { T } from "@/components/i18n/provider";

export default async function DownloadsPage() {
  const { org } = await getActiveOrg();
  if (!org) return null;
  const list = await get<{ data: LicenseDto[]; pagination: { next_cursor: string | null } }>(`/v1/organizations/${org.id}/licenses?limit=24`);
  return (
    <div className="mx-auto max-w-4xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold"><T>Downloads</T></h1>
      <p className="mt-1 mb-6 text-sm text-nav/60"><T>Imagens licenciadas por</T> {org.name}<T>. Pode descarregá-las novamente quando quiser.</T></p>
      <LicenseList orgId={org.id} canDownload={["owner", "admin", "member"].includes(org.role)} initial={list?.data ?? []} nextCursor={list?.pagination.next_cursor ?? null} />
    </div>
  );
}
