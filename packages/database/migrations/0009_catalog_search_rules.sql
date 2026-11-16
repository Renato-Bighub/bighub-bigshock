-- Pesquisa textual PostgreSQL FTS em português e inglês (CLAUDE.md §2).
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1, $2) $$;
--> statement-breakpoint
ALTER TABLE assets ADD COLUMN search_pt tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('portuguese', immutable_array_to_string(tags, ' ')), 'B') ||
  setweight(to_tsvector('portuguese', coalesce(description, '')), 'C')
) STORED;
--> statement-breakpoint
ALTER TABLE assets ADD COLUMN search_en tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', immutable_array_to_string(tags, ' ')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX assets_search_pt_idx ON assets USING gin (search_pt);
--> statement-breakpoint
CREATE INDEX assets_search_en_idx ON assets USING gin (search_en);
--> statement-breakpoint
-- Segunda barreira (a primeira é o serviço): um ativo sem direitos verificados nunca é publicado.
CREATE OR REPLACE FUNCTION assets_require_verified_rights() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'published' AND NOT EXISTS (
    SELECT 1 FROM rights_records WHERE asset_id = NEW.id AND verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'asset % cannot be published without verified rights', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER assets_publish_requires_rights
  BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_require_verified_rights();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON assets, rights_records, categories TO bigstock_app;
--> statement-breakpoint
-- Eventos de plataforma (sem organização) podem ser inseridos; a leitura continua restrita por tenant.
CREATE POLICY platform_events_insert ON audit_events FOR INSERT WITH CHECK (organization_id IS NULL);
