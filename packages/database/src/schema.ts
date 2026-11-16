import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  jsonb,
  type AnyPgColumn,
  boolean,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  billingType: text("billing_type", { enum: ["b2c", "b2b"] }).notNull().default("b2c"),
  vatId: text("vat_id"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  /** Nullable: utilizadores futuros via SSO não têm senha. Argon2id. */
  passwordHash: text("password_hash"),
  /** Papel global da plataforma (equipa editorial BIGhub). Nulo para clientes. */
  platformRole: text("platform_role", { enum: ["editor", "admin"] }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Sessões opacas: só o hash SHA-256 do token é guardado, nunca o token. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["owner", "admin", "member", "billing"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("org_members_org_user_uq").on(t.organizationId, t.userId)],
);

/** Append-only (trigger na migração de triggers). Saldo = soma, nunca uma coluna. */
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    entryType: text("entry_type", {
      enum: ["grant", "reserve", "release", "consume", "expire"],
    }).notNull(),
    balanceType: text("balance_type", {
      enum: ["promotional", "subscription", "purchased", "enterprise"],
    }).notNull(),
    amount: integer("amount").notNull(),
    sourceEntryId: uuid("source_entry_id").references((): AnyPgColumn => creditEntries.id),
    reservationId: uuid("reservation_id"),
    idempotencyKey: text("idempotency_key"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("credit_entries_org_idx").on(t.organizationId, t.createdAt),
    index("credit_entries_source_idx").on(t.sourceEntryId),
    uniqueIndex("credit_entries_idem_uq")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

/** Append-only. Regista acesso privilegiado, mudanças de direitos, operações financeiras. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_org_idx").on(t.organizationId, t.createdAt)],
);

/** Convites para uma organização. O token só existe em claro no momento da criação. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member", "billing"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").notNull().references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId), index("invitations_email_idx").on(t.email)],
);

export const categories = pgTable("categories", {
  slug: text("slug").primaryKey(),
  namePt: text("name_pt").notNull(),
  nameEn: text("name_en").notNull(),
});

/**
 * Acervo comercial (global, não pertence a nenhuma organização).
 * As colunas search_pt/search_en (tsvector geradas) existem só na migração SQL.
 * storage_key é interno e nunca é exposto pela API.
 */
export const assets = pgTable(
  "assets",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    kind: text("kind", { enum: ["photo", "vector", "illustration"] }).notNull().default("photo"),
    status: text("status", { enum: ["draft", "published", "unpublished"] }).notNull().default("draft"),
    categorySlug: text("category_slug").notNull().references(() => categories.slug),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    allowsAiTransform: boolean("allows_ai_transform").notNull().default(false),
    previewKey: text("preview_key"),
    previewContentType: text("preview_content_type"),
    /** Ficheiro original licenciável (interno, só sai por download assinado). */
    originalKey: text("original_key"),
    originalContentType: text("original_content_type"),
    originalBytes: integer("original_bytes"),
    createdBy: uuid("created_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("assets_status_published_idx").on(t.status, t.publishedAt, t.id),
    index("assets_category_idx").on(t.categorySlug),
  ],
);

/** Direitos do ativo. Sem verified_at preenchido o ativo nunca pode ser publicado. */
export const rightsRecords = pgTable(
  "rights_records",
  {
    id: id(),
    assetId: uuid("asset_id").notNull().references(() => assets.id),
    rightsHolder: text("rights_holder").notNull(),
    licenseBasis: text("license_basis").notNull(),
    modelRelease: boolean("model_release").notNull().default(false),
    propertyRelease: boolean("property_release").notNull().default(false),
    notes: text("notes"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rights_records_asset_uq").on(t.assetId)],
);

/** Versões dos termos de licença. Append-only: cada grant aponta para a versão vigente na compra. */
export const licenseTermsVersions = pgTable("license_terms_versions", {
  id: id(),
  version: text("version").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
});

/** Licença concedida a uma organização. Append-only e nunca revogada automaticamente. */
export const licenseGrants = pgTable(
  "license_grants",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    assetId: uuid("asset_id").notNull().references(() => assets.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    termsVersionId: uuid("terms_version_id").notNull().references(() => licenseTermsVersions.id),
    licenseType: text("license_type").notNull().default("standard"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("license_grants_idem_uq").on(t.organizationId, t.idempotencyKey),
    uniqueIndex("license_grants_org_asset_uq").on(t.organizationId, t.assetId),
    index("license_grants_org_created_idx").on(t.organizationId, t.createdAt, t.id),
  ],
);

/** Registo auditável de cada download efetuado. Append-only. */
export const downloadEvents = pgTable(
  "download_events",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    grantId: uuid("grant_id").notNull().references(() => licenseGrants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("download_events_org_idx").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Monetização (Fase 3)
// ---------------------------------------------------------------------------

/** Catálogo de planos. Valores PLACEHOLDER até decisão comercial; preços em cêntimos de EUR. */
export const plans = pgTable("plans", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  annualPriceCents: integer("annual_price_cents").notNull(),
  /** Créditos de IA incluídos por período. Nunca ilimitado. */
  includedCredits: integer("included_credits").notNull(),
  /** Licenças (downloads de ativos distintos) por período. */
  downloadQuota: integer("download_quota").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const creditPacks = pgTable("credit_packs", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceCents: integer("price_cents").notNull(),
  /** Validade dos créditos comprados, em meses. */
  validityMonths: integer("validity_months").notNull().default(12),
});

/** Cliente de faturação (Stripe) por organização. */
export const billingAccounts = pgTable("billing_accounts", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: createdAt(),
});

/** Estado atual da assinatura (mutável; o histórico financeiro vive em payments/invoices). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    planCode: text("plan_code").notNull().references(() => plans.code),
    status: text("status", { enum: ["active", "past_due", "cancelled", "incomplete"] }).notNull(),
    interval: text("interval", { enum: ["month", "year"] }).notNull().default("month"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Downgrade agendado: só entra em vigor no próximo ciclo. */
    pendingPlanCode: text("pending_plan_code").references(() => plans.code),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_org_uq").on(t.organizationId)],
);

/** Eventos de pagamento. Append-only: estornos/falhas entram como novas linhas. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    kind: text("kind", { enum: ["subscription", "credit_pack"] }).notNull(),
    status: text("status", { enum: ["succeeded", "failed", "refunded"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("eur"),
    /** Referência única do evento no fornecedor (idempotência). */
    providerRef: text("provider_ref").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payments_provider_ref_uq").on(t.providerRef), index("payments_org_idx").on(t.organizationId, t.createdAt)],
);

/** Faturas emitidas pelo fornecedor fiscal (Stripe Invoicing/Tax). Append-only. */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
    number: text("number"),
    amountCents: integer("amount_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    currency: text("currency").notNull().default("eur"),
    hostedUrl: text("hosted_url"),
    pdfUrl: text("pdf_url"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_org_idx").on(t.organizationId, t.issuedAt)],
);

/** Idempotência de webhooks: cada evento do fornecedor é processado uma só vez. */
export const providerEvents = pgTable("provider_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
