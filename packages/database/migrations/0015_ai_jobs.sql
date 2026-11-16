CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"prompt" text NOT NULL,
	"size" text NOT NULL,
	"quality" text NOT NULL,
	"reference_asset_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"cost_credits" integer NOT NULL,
	"reservation_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"error_code" text,
	"output_key" text,
	"output_content_type" text,
	"width" integer,
	"height" integer,
	"provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_reference_asset_id_assets_id_fk" FOREIGN KEY ("reference_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_idem_uq" ON "ai_jobs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_jobs_org_created_idx" ON "ai_jobs" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_jobs_org_status_idx" ON "ai_jobs" USING btree ("organization_id","status");