GRANT SELECT, INSERT, UPDATE ON invitations TO bigstock_app;
--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitations
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
-- O convidado (identificado por app.user_email) pode ver os convites dirigidos ao seu email.
CREATE POLICY invitee_access ON invitations FOR SELECT
  USING (email = nullif(current_setting('app.user_email', true), ''));
