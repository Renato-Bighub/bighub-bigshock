-- Isolamento multi-tenant imposto pela base de dados (CLAUDE.md §6).
-- A aplicação corre como bigstock_app (não-superuser) e define app.organization_id por transação.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bigstock_app') THEN
    CREATE ROLE bigstock_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO bigstock_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON organizations, organization_members TO bigstock_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON users TO bigstock_app;
--> statement-breakpoint
-- Append-only: sem UPDATE/DELETE concedidos (e triggers como segunda barreira).
GRANT SELECT, INSERT ON credit_entries, audit_events TO bigstock_app;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations
  USING (id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organization_members
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE credit_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON credit_entries
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_events
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
