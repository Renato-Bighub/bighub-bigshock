import type { MeResponse } from "@bigstock/contracts";
import { cookies } from "next/headers";
import { cache } from "react";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

async function get<T>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: { cookie }, cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getMe = cache(() => get<MeResponse>("/v1/auth/me"));
export const getCredits = (orgId: string) => get<{ data: { available: number } }>(`/v1/organizations/${orgId}/credits`);
