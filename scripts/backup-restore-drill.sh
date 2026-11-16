#!/usr/bin/env bash
# Simulacro de backup e restauro (CLAUDE.md §9, fase 6). Usa pg_dump/pg_restore e uma base de dados descartável.
#   SOURCE_URL=postgres://… ./scripts/backup-restore-drill.sh
# O SOURCE_URL deve ser um URL DIRETO (não "pooled") com permissão de leitura. Nunca aponta para produção sem aprovação.
set -euo pipefail
SOURCE_URL="${SOURCE_URL:?defina SOURCE_URL}"
SCRATCH_ADMIN_URL="${SCRATCH_ADMIN_URL:-postgres://bigstock@localhost:5433/postgres}"
SCRATCH_DB="bigstock_restore_drill_$(date +%s)"
DUMP="$(mktemp -d)/drill.dump"

echo "1/5 pg_dump (formato custom) …"
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$SOURCE_URL"
echo "   dump: $(du -h "$DUMP" | cut -f1)"

echo "2/5 criar base descartável $SCRATCH_DB …"
psql "$SCRATCH_ADMIN_URL" -qc "CREATE DATABASE $SCRATCH_DB"
SCRATCH_URL="${SCRATCH_ADMIN_URL%/*}/$SCRATCH_DB"
cleanup() { psql "$SCRATCH_ADMIN_URL" -qc "DROP DATABASE IF EXISTS $SCRATCH_DB" >/dev/null 2>&1 || true; rm -f "$DUMP"; }
trap cleanup EXIT

echo "3/5 pg_restore …"
# O papel bigstock_app é do cluster, não do dump: cria-o se faltar (as migrações também o fazem).
psql "$SCRATCH_ADMIN_URL" -qc "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bigstock_app') THEN CREATE ROLE bigstock_app NOLOGIN; END IF; END \$\$;"
pg_restore --no-owner --no-privileges --dbname="$SCRATCH_URL" "$DUMP"

echo "4/5 comparar contagens de linhas (origem vs restauro) …"
TABLES=$(psql "$SOURCE_URL" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
FAIL=0
for t in $TABLES; do
  a=$(psql "$SOURCE_URL" -Atc "SELECT count(*) FROM \"$t\"")
  b=$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM \"$t\"")
  if [ "$a" != "$b" ]; then echo "   DIFERENTE: $t origem=$a restauro=$b"; FAIL=1; fi
done
[ "$FAIL" = 0 ] && echo "   todas as tabelas coincidem"

echo "5/5 verificar integridade estrutural no restauro (triggers append-only e RLS) …"
TRIG=$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%append_only'")
RLS=$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM pg_class WHERE relkind='r' AND relrowsecurity AND relforcerowsecurity")
echo "   triggers append-only: $TRIG | tabelas com RLS forçado: $RLS"
[ "$TRIG" -ge 7 ] && [ "$RLS" -ge 10 ] || { echo "FALHA: estrutura de segurança incompleta no restauro"; exit 1; }
[ "$FAIL" = 0 ] || exit 1
echo "OK: restauro verificado"
