GRANT SELECT ON plans, credit_packs TO bigstock_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON billing_accounts, subscriptions TO bigstock_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON payments, invoices TO bigstock_app;
--> statement-breakpoint
-- Eventos do fornecedor chegam por webhook, sem contexto de organização.
GRANT SELECT, INSERT ON provider_events TO bigstock_app;
--> statement-breakpoint
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON billing_accounts
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subscriptions
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payments
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invoices
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
-- Tabelas financeiras são append-only (CLAUDE.md §4).
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER invoices_append_only BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
-- Planos e pacotes: VALORES PLACEHOLDER (sujeitos a decisão comercial). Preços em cêntimos de EUR.
INSERT INTO plans (code, name, monthly_price_cents, annual_price_cents, included_credits, download_quota, sort_order) VALUES
  ('free',         'Gratuito',     0,      0,      0,     3,   0),
  ('starter',      'Starter',      1900,   18240,  500,   30,  1),
  ('pro',          'Profissional', 4900,   47040,  4000,  150, 2),
  ('business',     'Business',     14900,  143040, 15000, 600, 3),
  ('api_platform', 'API Platform', 29900,  287040, 30000, 2000, 4)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO credit_packs (code, name, credits, price_cents, validity_months) VALUES
  ('pack_500',  'Starter', 500,  900,  12),
  ('pack_2000', 'Creator', 2000, 2900, 12),
  ('pack_5000', 'Studio',  5000, 5900, 12)
ON CONFLICT (code) DO NOTHING;
