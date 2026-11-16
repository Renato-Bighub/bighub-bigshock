GRANT SELECT, INSERT, UPDATE ON ai_jobs TO bigstock_app;
--> statement-breakpoint
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Prompts e imagens geradas são privados da organização.
CREATE POLICY tenant_isolation ON ai_jobs
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
