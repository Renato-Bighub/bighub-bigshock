import type { AssetListResponse } from "@bigstock/contracts";
import { get, getActiveOrg } from "@/lib/server-api";
import { Explorer, type Category } from "./explorer";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q = "", category = "" } = await searchParams;
  const params = new URLSearchParams({ limit: "24" });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  const { org } = await getActiveOrg();
  const [list, cats, terms] = await Promise.all([
    get<AssetListResponse>(`/v1/assets?${params}`),
    get<{ data: Category[] }>("/v1/categories"),
    get<{ data: { version: string; title: string; summary: string } }>("/v1/license-terms/current"),
  ]);
  return (
    <Explorer
      key={`${q}|${category}`}
      q={q}
      category={category}
      categories={cats?.data ?? []}
      initial={list?.data ?? []}
      nextCursor={list?.pagination.next_cursor ?? null}
      orgId={org?.id ?? null}
      canLicense={org ? ["owner", "admin", "member"].includes(org.role) : false}
      terms={terms?.data ?? null}
    />
  );
}
