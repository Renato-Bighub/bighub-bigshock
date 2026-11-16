-- Retenção (RGPD: limitação da conservação). Dados operacionais de curta duração podem ser apagados pela aplicação.
GRANT DELETE ON sessions, auth_attempts TO bigstock_app;
--> statement-breakpoint
GRANT DELETE ON api_usage_minutes TO bigstock_app;
--> statement-breakpoint
-- api_usage_minutes tem RLS por organização; esta política permite ao job de retenção apagar linhas antigas de qualquer organização.
CREATE POLICY retention_cleanup ON api_usage_minutes FOR DELETE
  USING (minute_start < now() - interval '90 days');
--> statement-breakpoint
-- Encerramento de organização: remoção de conteúdo privado (prompts) mantendo o registo.
GRANT DELETE ON organization_members TO bigstock_app;
