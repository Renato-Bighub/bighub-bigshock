-- Tabelas financeiras e de auditoria são append-only (CLAUDE.md §4).
-- Estornos/anulações entram como novas linhas, nunca como UPDATE/DELETE.
CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER credit_entries_append_only
  BEFORE UPDATE OR DELETE ON credit_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
