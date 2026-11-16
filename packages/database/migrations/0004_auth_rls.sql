GRANT SELECT, INSERT, UPDATE ON users, sessions TO bigstock_app;
--> statement-breakpoint
-- Um utilizador autenticado (app.user_id) vê as suas próprias pertenças e as organizações a que pertence.
CREATE POLICY member_self_access ON organization_members FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY member_org_access ON organizations FOR SELECT
  USING (id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));
