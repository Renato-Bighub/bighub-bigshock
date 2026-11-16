GRANT SELECT ON license_terms_versions TO bigstock_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON license_grants, download_events TO bigstock_app;
--> statement-breakpoint
ALTER TABLE license_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE license_grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON license_grants
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE download_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE download_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON download_events
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint
-- Append-only: concessões, downloads e versões de termos nunca são alterados nem apagados.
CREATE TRIGGER license_grants_append_only BEFORE UPDATE OR DELETE ON license_grants
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER download_events_append_only BEFORE UPDATE OR DELETE ON download_events
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER license_terms_versions_append_only BEFORE UPDATE OR DELETE ON license_terms_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
--> statement-breakpoint
-- Termos v1. TEXTO PROVISÓRIO: sujeito a revisão jurídica antes do lançamento (CLAUDE.md §9, fase 6).
INSERT INTO license_terms_versions (version, title, summary) VALUES (
  'standard-1.0',
  'Licença comercial standard',
  'Uso comercial não exclusivo, mundial e perpétuo da imagem em materiais digitais e impressos da organização licenciada, incluindo web, redes sociais, publicidade e apresentações. Não é permitido revender ou redistribuir o ficheiro como tal, nem usá-lo em marcas registadas, nem em contexto difamatório ou ilegal. Imagens com pessoas identificáveis não podem ser usadas de forma a sugerir endosso. Termos provisórios, sujeitos a revisão jurídica.'
) ON CONFLICT (version) DO NOTHING;
