import { HttpException, Injectable } from "@nestjs/common";
import { and, count, eq, gte, licenseGrants, plans, sql, subscriptions, type Tx } from "@bigstock/database";

export interface Entitlement {
  planCode: string;
  planName: string;
  downloadQuota: number;
  includedCredits: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Direitos do plano da organização. Decide quotas no BACKEND (CLAUDE.md §5): nada vem do cliente.
 * Sem assinatura ativa (ou cancelada/incompleta) vale o plano "free". Em `past_due` mantém-se o plano
 * durante a janela de dunning gerida pelo fornecedor; acesso a dados já adquiridos nunca é bloqueado.
 */
@Injectable()
export class EntitlementsService {
  async forOrganization(tx: Tx, orgId: string, now = new Date()): Promise<Entitlement> {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId));
    const paying = sub && (sub.status === "active" || sub.status === "past_due") && sub.currentPeriodEnd > now;
    const code = paying ? sub.planCode : "free";
    const [plan] = await tx.select().from(plans).where(eq(plans.code, code));
    if (!plan) throw new Error(`plan ${code} not found`);
    if (paying) {
      return { planCode: code, planName: plan.name, downloadQuota: plan.downloadQuota, includedCredits: plan.includedCredits, windowStart: sub.currentPeriodStart, windowEnd: sub.currentPeriodEnd };
    }
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { planCode: code, planName: plan.name, downloadQuota: plan.downloadQuota, includedCredits: plan.includedCredits, windowStart: start, windowEnd: end };
  }

  async downloadsUsed(tx: Tx, orgId: string, ent: Entitlement): Promise<number> {
    const [r] = await tx
      .select({ n: count() })
      .from(licenseGrants)
      .where(and(eq(licenseGrants.organizationId, orgId), gte(licenseGrants.createdAt, ent.windowStart), sql`${licenseGrants.createdAt} < ${ent.windowEnd}`));
    return r?.n ?? 0;
  }

  /** Lança 402 se a organização esgotou as licenças do período. Chamar com o lock da organização. */
  async assertCanLicense(tx: Tx, orgId: string): Promise<void> {
    const ent = await this.forOrganization(tx, orgId);
    const used = await this.downloadsUsed(tx, orgId, ent);
    if (used >= ent.downloadQuota) {
      throw new HttpException(
        { code: "download_quota_exceeded", message: `Plan ${ent.planCode} allows ${ent.downloadQuota} licenses per period` },
        402,
      );
    }
  }
}
