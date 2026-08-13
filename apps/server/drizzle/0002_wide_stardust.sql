CREATE TYPE "public"."quota_type" AS ENUM('direct', 'balance', 'rolling');--> statement-breakpoint
ALTER TABLE "usage_events" RENAME COLUMN "consumed" TO "amount";--> statement-breakpoint
ALTER TABLE "quotas" DROP CONSTRAINT "quotas_window_amount_positive";--> statement-breakpoint
ALTER TABLE "quotas" DROP CONSTRAINT "quotas_limit_non_negative_finite";--> statement-breakpoint
ALTER TABLE "usage_events" DROP CONSTRAINT "usage_events_consumed_positive_finite";--> statement-breakpoint
ALTER TABLE "quotas" ALTER COLUMN "quota_limit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quotas" ALTER COLUMN "window_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quotas" ALTER COLUMN "window_unit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quotas" ADD COLUMN "scope_value" text;--> statement-breakpoint
ALTER TABLE "quotas" ADD COLUMN "quota_type" "quota_type" DEFAULT 'rolling' NOT NULL;--> statement-breakpoint
CREATE INDEX "quotas_effective_lookup_idx" ON "quotas" USING btree ("workspace_id","metric_id","scope_id","scope_value","deleted_at");--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_scope_value_valid" CHECK ("quotas"."scope_value" is null or length("quotas"."scope_value") between 1 and 512);--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_kind_window_valid" CHECK (("quotas"."quota_type" = 'rolling' and "quotas"."window_amount" > 0 and "quotas"."window_unit" is not null) or ("quotas"."quota_type" in ('direct', 'balance') and "quotas"."window_amount" is null and "quotas"."window_unit" is null));--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_limit_non_negative_finite" CHECK ("quotas"."quota_limit" is null or ("quotas"."quota_limit" >= 0 and "quotas"."quota_limit" < 'Infinity'::double precision));--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_amount_non_zero_finite" CHECK ("usage_events"."amount" <> 0 and abs("usage_events"."amount") < 'Infinity'::double precision);
--> statement-breakpoint
CREATE UNIQUE INDEX "quotas_active_rolling_unique" ON "quotas" (
  "workspace_id", "metric_id", "scope_id", COALESCE("scope_value", ''),
  "window_amount", "window_unit"
) WHERE "deleted_at" IS NULL AND "quota_type" = 'rolling';
--> statement-breakpoint
CREATE UNIQUE INDEX "quotas_active_single_kind_unique" ON "quotas" (
  "workspace_id", "metric_id", "scope_id", COALESCE("scope_value", '')
) WHERE "deleted_at" IS NULL AND "quota_type" IN ('direct', 'balance');
--> statement-breakpoint
CREATE FUNCTION enforce_quota_selector_kind() RETURNS trigger AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.workspace_id::text || ':' || NEW.metric_id::text || ':' ||
    NEW.scope_id::text || ':' || COALESCE(NEW.scope_value, ''), 0
  ));
  IF EXISTS (
    SELECT 1 FROM quotas existing
    WHERE existing.workspace_id = NEW.workspace_id
      AND existing.metric_id = NEW.metric_id
      AND existing.scope_id = NEW.scope_id
      AND existing.scope_value IS NOT DISTINCT FROM NEW.scope_value
      AND existing.deleted_at IS NULL
      AND existing.id IS DISTINCT FROM NEW.id
      AND existing.quota_type <> NEW.quota_type
  ) THEN
    RAISE EXCEPTION 'quota selector cannot mix quota kinds' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER quotas_enforce_selector_kind
BEFORE INSERT OR UPDATE ON quotas
FOR EACH ROW EXECUTE FUNCTION enforce_quota_selector_kind();
