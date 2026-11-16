CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'photo' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"category_slug" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"allows_ai_transform" boolean DEFAULT false NOT NULL,
	"preview_key" text,
	"preview_content_type" text,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"slug" text PRIMARY KEY NOT NULL,
	"name_pt" text NOT NULL,
	"name_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rights_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"rights_holder" text NOT NULL,
	"license_basis" text NOT NULL,
	"model_release" boolean DEFAULT false NOT NULL,
	"property_release" boolean DEFAULT false NOT NULL,
	"notes" text,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" text;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_slug_categories_slug_fk" FOREIGN KEY ("category_slug") REFERENCES "public"."categories"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_records" ADD CONSTRAINT "rights_records_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_records" ADD CONSTRAINT "rights_records_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_status_published_idx" ON "assets" USING btree ("status","published_at","id");--> statement-breakpoint
CREATE INDEX "assets_category_idx" ON "assets" USING btree ("category_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "rights_records_asset_uq" ON "rights_records" USING btree ("asset_id");