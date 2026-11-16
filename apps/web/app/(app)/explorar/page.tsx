import type { AssetListResponse } from "@bigstock/contracts";
import { get } from "@/lib/server-api";
import { Explorer, type Category } from "./explorer";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q = "", category = "" } = await searchParams;
  const params = new URLSearchParams({ limit: "24" });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  const [list, cats] = await Promise.all([
    get<AssetListResponse>(`/v1/assets?${params}`),
    get<{ data: Category[] }>("/v1/categories"),
  ]);
  return (
    <Explorer
      key={`${q}|${category}`}
      q={q}
      category={category}
      categories={cats?.data ?? []}
      initial={list?.data ?? []}
      nextCursor={list?.pagination.next_cursor ?? null}
    />
  );
}
