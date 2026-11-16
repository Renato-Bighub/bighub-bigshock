import type { MeResponse } from "@bigstock/contracts";
import { cookies } from "next/headers";
import { cache } from "react";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function get<T>(path: string): Promise<T | null> {
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
export interface BillingSummary {
  plan_code: string;
  plan_name: string;
  subscription: { status: string; interval: string; current_period_end: string; cancel_at_period_end: boolean; pending_plan_code: string | null } | null;
  downloads: { used: number; quota: number; window_end: string };
  credits: { available: number; included_per_period: number; plan: number; plan_expires_at: string | null; own: number };
  has_billing_account: boolean;
}
export const getBilling = (orgId: string) => get<{ data: BillingSummary }>(`/v1/organizations/${orgId}/billing`);
export const getCredits = (orgId: string) => get<{ data: { available: number } }>(`/v1/organizations/${orgId}/credits`);

export const ORG_COOKIE = "bs_org";

/** Organização ativa: a do cookie bs_org se o utilizador ainda for membro, senão a primeira. */
export async function getActiveOrg() {
  const me = await getMe();
  if (!me) return { me: null, org: undefined };
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const org = me.organizations.find((o) => o.id === wanted) ?? me.organizations[0];
  return { me, org };
}
