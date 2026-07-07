CREATE TYPE "public"."quota_window_unit" AS ENUM('minute', 'hour', 'day', 'week');--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"quota_limit" double precision NOT NULL,
	"window_amount" integer NOT NULL,
	"window_unit" "quota_window_unit" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotas_limit_non_negative_finite" CHECK ("quotas"."quota_limit" >= 0 and "quotas"."quota_limit" < 'Infinity'::double precision),
	CONSTRAINT "quotas_window_amount_positive" CHECK ("quotas"."window_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_workspace_id_id_unique" ON "metrics" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "scopes_workspace_id_id_unique" ON "scopes" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_workspace_metric_fk" FOREIGN KEY ("workspace_id","metric_id") REFERENCES "public"."metrics"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_workspace_scope_fk" FOREIGN KEY ("workspace_id","scope_id") REFERENCES "public"."scopes"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_active_workspace_key_unique" ON "metrics" USING btree ("workspace_id","key") WHERE "metrics"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "metrics_workspace_active_idx" ON "metrics" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "quotas_workspace_active_idx" ON "quotas" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "quotas_workspace_metric_idx" ON "quotas" USING btree ("workspace_id","metric_id");--> statement-breakpoint
CREATE INDEX "quotas_workspace_scope_idx" ON "quotas" USING btree ("workspace_id","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scopes_active_workspace_key_unique" ON "scopes" USING btree ("workspace_id","key") WHERE "scopes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "scopes_workspace_active_idx" ON "scopes" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_active_slug_unique" ON "workspaces" USING btree ("slug") WHERE "workspaces"."deleted_at" is null;
