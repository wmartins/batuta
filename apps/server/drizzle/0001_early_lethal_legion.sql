CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"secret_hint" text NOT NULL,
	"secret_hash" "bytea" NOT NULL,
	"hash_version" smallint DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_name_valid" CHECK (length(btrim("api_keys"."name")) between 1 and 100 and "api_keys"."name" = btrim("api_keys"."name")),
	CONSTRAINT "api_keys_secret_hint_length" CHECK (octet_length("api_keys"."secret_hint") = 4),
	CONSTRAINT "api_keys_secret_hash_length" CHECK (octet_length("api_keys"."secret_hash") = 32),
	CONSTRAINT "api_keys_hash_version_v1" CHECK ("api_keys"."hash_version" = 1),
	CONSTRAINT "api_keys_expiration_after_creation" CHECK ("api_keys"."expires_at" is null or "api_keys"."expires_at" > "api_keys"."created_at")
);
--> statement-breakpoint
CREATE TABLE "usage_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_batches_idempotency_key_valid" CHECK (octet_length("usage_batches"."idempotency_key") between 8 and 128 and "usage_batches"."idempotency_key" ~ '^[!-~]+$'),
	CONSTRAINT "usage_batches_request_hash_length" CHECK (octet_length("usage_batches"."request_hash") = 32)
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"scope_value" text NOT NULL,
	"consumed" double precision NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_scope_value_valid" CHECK (length("usage_events"."scope_value") between 1 and 512),
	CONSTRAINT "usage_events_consumed_positive_finite" CHECK ("usage_events"."consumed" > 0 and "usage_events"."consumed" < 'Infinity'::double precision)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_workspace_id_id_unique" ON "api_keys" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_batches_workspace_idempotency_unique" ON "usage_batches" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_batches_workspace_id_id_unique" ON "usage_batches" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_batches" ADD CONSTRAINT "usage_batches_workspace_api_key_fk" FOREIGN KEY ("workspace_id","api_key_id") REFERENCES "public"."api_keys"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_batch_fk" FOREIGN KEY ("workspace_id","batch_id") REFERENCES "public"."usage_batches"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_metric_fk" FOREIGN KEY ("workspace_id","metric_id") REFERENCES "public"."metrics"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_scope_fk" FOREIGN KEY ("workspace_id","scope_id") REFERENCES "public"."scopes"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_workspace_idx" ON "api_keys" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_query_idx" ON "usage_events" USING btree ("workspace_id","metric_id","scope_id","scope_value","occurred_at");
