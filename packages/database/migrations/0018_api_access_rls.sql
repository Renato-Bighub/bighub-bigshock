GRANT SELECT, INSERT, UPDATE ON api_keys, api_usage_minutes, api_usage_monthly TO bigstock_app;
--> statement-breakpoint
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON api_keys
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
-- Autenticação: a chave é localizada pelo prefixo antes de a organização ser conhecida.
CREATE POLICY api_key_lookup ON api_keys FOR SELECT
  USING (key_prefix = nullif(current_setting('app.api_key_prefix', true), ''));
--> statement-breakpoint
ALTER TABLE api_usage_minutes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE api_usage_minutes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON api_usage_minutes
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE api_usage_monthly ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE api_usage_monthly FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON api_usage_monthly
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
-- Limites de API por plano (PLACEHOLDER até decisão comercial). Sem acesso: free, starter, pro.
UPDATE plans SET api_requests_per_minute = 300,  api_monthly_requests = 100000   WHERE code = 'business';
--> statement-breakpoint
UPDATE plans SET api_requests_per_minute = 1200, api_monthly_requests = 1000000  WHERE code = 'api_platform';
