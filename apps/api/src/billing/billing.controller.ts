import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { z, type ZodType } from "zod";
import { SessionGuard } from "../auth/auth.guard.js";
import { OrgGuard, type OrgRequest, RequirePermission } from "../organizations/org.guard.js";
import { CreditsService } from "./credits.service.js";
import { BillingService } from "./billing.service.js";
import { WebhookService } from "./webhook.service.js";
import { Inject } from "@nestjs/common";
import { BILLING_PROVIDER, type BillingProvider } from "./provider.js";

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ code: "validation_error", message: r.error.issues[0]?.message ?? "Invalid input" });
  return r.data;
}

const checkoutBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscription"), plan: z.string().min(1).max(40), interval: z.enum(["month", "year"]).default("month") }),
  z.object({ type: z.literal("credit_pack"), pack: z.string().min(1).max(40) }),
]);
const changePlanBody = z.object({ plan: z.string().min(1).max(40), interval: z.enum(["month", "year"]).default("month") });
const ledgerQuery = z.object({ cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

@Controller("v1")
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly credits: CreditsService,
  ) {}

  @Get("plans")
  @UseGuards(SessionGuard)
  async plans(@Req() req: Request) {
    return { data: await this.billing.catalog(), request_id: String(req.id) };
  }

  @Get("organizations/:orgId/billing")
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("credits:read")
  async summary(@Req() req: OrgRequest) {
    return { data: await this.billing.summary(req.org.id), request_id: String(req.id) };
  }

  @Get("organizations/:orgId/credits/ledger")
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("credits:read")
  async ledger(@Query() query: Record<string, string>, @Req() req: OrgRequest) {
    const q = parse(ledgerQuery, query);
    const r = await this.credits.ledger(req.org.id, q.limit, q.cursor);
    return { data: r.data, pagination: { next_cursor: r.next_cursor, has_more: r.has_more }, request_id: String(req.id) };
  }

  @Post("organizations/:orgId/billing/checkout")
  @HttpCode(200)
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("billing:manage")
  async checkout(@Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Req() req: OrgRequest) {
    // Comprar créditos/assinar é uma operação paga: Idempotency-Key obrigatória (CLAUDE.md §5).
    if (!key || key.length < 8 || key.length > 128) {
      throw new BadRequestException({ code: "idempotency_key_required", message: "Idempotency-Key header (8-128 chars) is required" });
    }
    const data = await this.billing.checkout(req.org.id, req.user.email, parse(checkoutBody, body), `${req.org.id}:${key}`);
    return { data, request_id: String(req.id) };
  }

  @Post("organizations/:orgId/billing/portal")
  @HttpCode(200)
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("billing:manage")
  async portal(@Req() req: OrgRequest) {
    return { data: await this.billing.portal(req.org.id), request_id: String(req.id) };
  }

  @Post("organizations/:orgId/billing/change-plan")
  @HttpCode(200)
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("billing:manage")
  async changePlan(@Body() body: unknown, @Req() req: OrgRequest) {
    return { data: await this.billing.changePlan(req.org.id, parse(changePlanBody, body)), request_id: String(req.id) };
  }

  @Get("organizations/:orgId/billing/invoices")
  @UseGuards(SessionGuard, OrgGuard)
  @RequirePermission("billing:manage")
  async invoices(@Req() req: OrgRequest) {
    return { data: await this.billing.invoices(req.org.id), request_id: String(req.id) };
  }
}

@Controller("v1/webhooks")
export class WebhookController {
  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly webhooks: WebhookService,
  ) {}

  /** Autenticado pela assinatura do fornecedor (não por sessão). Exige o corpo cru. */
  @Post("stripe")
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature: string | undefined) {
    if (!signature || !req.rawBody) throw new BadRequestException({ code: "invalid_signature", message: "Missing signature or body" });
    let event;
    try {
      event = this.provider.verifyWebhook(req.rawBody, signature);
    } catch (e) {
      if ((e as { status?: number }).status === 503) throw e;
      throw new BadRequestException({ code: "invalid_signature", message: "Webhook signature verification failed" });
    }
    const r = await this.webhooks.handle(event);
    return { received: true, duplicate: r.duplicate };
  }
}
