CREATE TABLE "download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"terms_version_id" uuid NOT NULL,
	"license_type" text DEFAULT 'standard' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_terms_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "license_terms_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_key" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_content_type" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_bytes" integer;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_grant_id_license_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."license_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_grants" ADD CONSTRAINT "license_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_grants" ADD CONSTRAINT "license_grants_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_grants" ADD CONSTRAINT "license_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_grants" ADD CONSTRAINT "license_grants_terms_version_id_license_terms_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."license_terms_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "download_events_org_idx" ON "download_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "license_grants_idem_uq" ON "license_grants" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "license_grants_org_asset_uq" ON "license_grants" USING btree ("organization_id","asset_id");--> statement-breakpoint
CREATE INDEX "license_grants_org_created_idx" ON "license_grants" USING btree ("organization_id","created_at","id");