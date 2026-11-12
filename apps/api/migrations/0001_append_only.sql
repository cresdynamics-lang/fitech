INSERT INTO "role" ("code") VALUES ('OWNER'), ('MANAGER'), ('CASHIER'), ('INVENTORY');
--> statement-breakpoint
COMMENT ON TABLE "login_attempt" IS 'Sign-in attempts. Login locks after 3 failures. The lock duration is not set.';
--> statement-breakpoint
COMMENT ON COLUMN "permission_grant"."access_code_expires_at" IS 'Expiry of the code sent when the super admin grants restricted access. That code lasts 15 minutes.';
--> statement-breakpoint
COMMENT ON TABLE "device_cost_entry" IS 'Append-only. Staff may add a cost during a sale. After the sale, cost access is restricted. Sale is not a table in this phase.';
--> statement-breakpoint
COMMENT ON COLUMN "payment_record"."method" IS 'Factual method names so far: cash, M-Pesa, bank, Lipa, and card. Payment rules are not closed.';
--> statement-breakpoint
COMMENT ON TABLE "setting" IS 'Per-user account settings. Named sections: account, profile, permissions, preferences. Further sections are allowed.';
--> statement-breakpoint
COMMENT ON COLUMN "device"."direction" IS 'Partner arrangement for this phone. direction, due, settlement, and swap are stored per device because one partner has many phones.';
--> statement-breakpoint
CREATE INDEX "login_attempt_email_created_at" ON "login_attempt" ("email", "created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fitech_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % rejects %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "device_event_append_only"
  BEFORE UPDATE OR DELETE ON "device_event"
  FOR EACH ROW
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "device_event_append_only_truncate"
  BEFORE TRUNCATE ON "device_event"
  FOR EACH STATEMENT
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "device_cost_entry_append_only"
  BEFORE UPDATE OR DELETE ON "device_cost_entry"
  FOR EACH ROW
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "device_cost_entry_append_only_truncate"
  BEFORE TRUNCATE ON "device_cost_entry"
  FOR EACH STATEMENT
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "payment_record_append_only"
  BEFORE UPDATE OR DELETE ON "payment_record"
  FOR EACH ROW
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "payment_record_append_only_truncate"
  BEFORE TRUNCATE ON "payment_record"
  FOR EACH STATEMENT
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT
  EXECUTE FUNCTION fitech_reject_append_only_mutation();
