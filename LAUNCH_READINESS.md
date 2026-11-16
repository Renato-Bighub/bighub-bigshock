# Fase 6 — Validação e prontidão para lançamento

Estado em 2026-11-16. Documento vivo: cada item tem evidência (teste, comando ou medição) ou está marcado como **lacuna**.

## 1. Carga (medido localmente)

`autocannon`, 50 ligações, 15 s por cenário, API Node única contra PostgreSQL 14 local (pool de 10). **Não representa a Vercel + Neon**
(latência de rede ao banco e arranques a frio); serve para detetar regressões e gargalos de código.

| Cenário | req/s | p50 | p97,5 | p99 | Erros |
|---|---|---|---|---|---|
| `GET /v1/health` | ~39 800 | 1 ms | 2 ms | 2 ms | 0 |
| `GET /v1/assets?q=…` (sessão, FTS pt/en) | ~9 600 | 4 ms | 7 ms | 10 ms | 0 |
| `GET /v1/assets` (sessão, lista) | ~3 400 | 14 ms | 19 ms | 26 ms | 0 |
| `GET /v1/credits` (chave de API: middleware + 2 upserts + RLS) | ~3 900 | 12 ms | 17 ms | 19 ms | 0 |
| `GET /v1/assets?q=…` (chave de API) | ~4 400 | 10 ms | 17 ms | 22 ms | 0 |

Concorrência de negócio (testes automáticos): 20 reservas simultâneas de créditos nunca excedem o saldo; 5 licenças simultâneas
com a mesma chave geram 1 concessão; 4 gerações simultâneas com a mesma `Idempotency-Key` reservam 1 vez.

**Lacuna:** teste de carga em ambiente de staging com Neon + Vercel (latência real, cold start, limite de ligações do pooler). Recomendado: k6 a 50–100 req/s durante 10 min antes do beta.

## 2. Segurança

| Controlo | Evidência |
|---|---|
| Isolamento entre organizações (RLS forçado em toda tabela com `organization_id`) | `packages/database/src/tenancy-sweep.test.ts` (corre em todo PR; falha se uma tabela nova ficar sem RLS) + testes de isolamento por módulo |
| Papel da aplicação sem `BYPASSRLS`/superuser | teste de varredura + verificado em produção (`bigstock_api`) |
| Tabelas financeiras/auditoria append-only (trigger + sem `UPDATE/DELETE` concedidos) | teste de varredura |
| Sem coluna de saldo | teste de varredura |
| Senhas argon2id; sessões opacas (hash SHA-256 no BD); cookie HttpOnly/SameSite=Lax/Secure | `auth.test.ts`, `security.test.ts` |
| Força bruta no login: 10 falhas/15 min por e-mail (e 50 por IP) → 429; contadores em BD (valem entre instâncias) | `security.test.ts` |
| Chaves de API: só hash guardado, escopos, negação por omissão, limite por minuto/mês | `api-keys.test.ts` |
| URLs de download assinados, curta validade; uploads validados pelos bytes | `licensing.test.ts`, `catalog.test.ts` |
| Cabeçalhos de segurança (API: helmet; web: nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP parcial) | `security.test.ts` + `next.config.ts` |
| Sem CORS permissivo; sem `X-Powered-By` | `security.test.ts` |
| Dependências de produção sem vulnerabilidades conhecidas (`pnpm audit --prod`) | executado; Dependabot semanal configurado |
| Sem segredos no código nem no histórico (20 commits varridos) | varredura por padrões (Stripe, AWS, chaves privadas, chaves de API, Neon) |
| Erros 5xx genéricos para o cliente; Sentry opcional (`SENTRY_DSN`) sem cookies/cabeçalhos de auth/corpos | `observability.ts` |

**Lacunas de segurança**
- CSP sem `script-src` (o Next injeta scripts inline). Para endurecer é preciso CSP com *nonces* num middleware do Next.
- Limite de taxa das rotas autenticadas por sessão (pesquisa, etc.) é só o do `@nestjs/throttler` em memória nas rotas de auth. Para limites globais por IP é preciso Redis ou WAF (Vercel Firewall).
- Registo de conta revela se um e-mail existe (`409 email_taken`). Aceite por usabilidade; rever.
- **Sem verificação de e-mail**, **sem recuperação de senha**, **sem MFA** (ver §5).
- Convites devolvem o token a quem convida (sem fornecedor de e-mail).
- OpenTelemetry não implementado (CLAUDE.md §2); só Sentry (API). Web sem Sentry.
- 2FA da conta Vercel/GitHub/Neon/Stripe: ativar (a Vercel já avisou).

## 3. Backup e restauro

- **Simulacro automatizado:** `scripts/backup-restore-drill.sh` faz `pg_dump` → base descartável → `pg_restore`, compara contagens de linhas de todas as tabelas e confirma triggers append-only e RLS forçado no restauro. Resultado local: **OK** (7 triggers, 15 tabelas com RLS, todas as contagens iguais).
- **Produção (Neon):** o Neon mantém histórico para *point-in-time restore* (janela depende do plano; no gratuito é curta). **Lacuna:** confirmar a janela de retenção do plano, executar um restauro por *branch* do Neon e documentar RPO/RTO. O `pg_dump` local (v14) não corre contra o Neon (v16/17): use um cliente `pg_dump` ≥ servidor.
- **S3/R2:** ativar versionamento do bucket e retenção; os originais licenciados não podem ser perdidos.

## 4. Conformidade

| Tema | Estado |
|---|---|
| AI Act art. 50 | Fornecedor/modelo por geração em BD; metadados XMP/IPTC + tEXt nos PNG; selo "Gerado por IA" na UI. **Não é C2PA.** |
| RGPD — minimização, base legal | Parcial: dados mínimos; Sentry e logs sem PII. **Lacuna:** registo de tratamentos, lista de subprocessadores (Vercel, Neon, Stripe, OpenAI, S3/R2, Sentry), DPA e transferências para EUA (cláusulas contratuais-tipo). |
| RGPD — exportação e eliminação | **Lacuna:** não há endpoints nem processo para exportar/eliminar dados de um utilizador. Registos financeiros e de auditoria são append-only: é preciso política de anonimização (reter o necessário por obrigação legal, anonimizar o resto). |
| IVA/UE | Preparado via Stripe Tax (`STRIPE_AUTOMATIC_TAX`), **desligado**. Validação de NIF/VAT feita pelo checkout da Stripe. Nada de imposto no frontend. |
| **Faturação certificada em Portugal** | **Lacuna crítica a validar com contabilista:** faturas da Stripe podem não cumprir a certificação AT (ATCUD, SAF-T). Se não cumprirem, integrar emissor certificado (Moloni, InvoiceXpress, Vendus…). |
| Termos de licença / ToS / Política de Privacidade | Termos de licença v1 **provisórios**. **Lacuna:** revisão jurídica; páginas públicas de Termos e Privacidade; consentimento (só cookies essenciais hoje → sem banner, mas é preciso informação). |
| Direitos do catálogo | Regras no backend e na BD (sem `verified_at` não publica; `allows_ai_transform`; remoção não revoga licenças). **Lacuna:** processo editorial e jurídico de verificação e de pedidos de remoção. |
| Imagens demonstrativas | O site em produção serve miniaturas **sem direitos comerciais**, a pedido do dono do produto. Substituir antes do lançamento. |

## 5. Lacunas funcionais que bloqueiam um beta B2B

1. **E-mail transacional** (convites, verificação, recuperação de senha): sem isto, um utilizador que perca a senha fica sem acesso.
2. **Stripe em produção** (chaves, webhook, Billing Portal, Stripe Tax) e decisão da faturação certificada.
3. **S3/R2** (catálogo em produção está vazio; sem ele não há previews, originais nem imagens de IA).
4. **Redis + worker + chave OpenAI** para ligar a geração por IA.
5. Preços, créditos, quotas e limites de API **são placeholders**.
6. Importação em massa e interface editorial do catálogo; upload direto para S3 (limite de 4 MB na Vercel).

## 6. Plano de beta com um parceiro B2B piloto

1. Fechar os itens 1–4 da secção 5 e a revisão jurídica dos termos.
2. Ambiente de **staging** (projetos Vercel + Neon *branch* + Stripe em modo teste) e teste de carga com k6.
3. Carregar um catálogo inicial com direitos verificados (≥ 200 ativos) e publicar.
4. Onboarding do parceiro: organização, plano API Platform, chave de API com escopos mínimos, sessão de integração com a documentação em `/docs`.
5. Duas semanas com métricas: erros 5xx (Sentry), p95, uso de API vs quota, créditos consumidos vs reservados, falhas de IA e devoluções, pagamentos.
6. Critério de saída: 0 incidentes de isolamento de dados, 0 cobranças duplicadas, p95 < 500 ms na API, reconciliação de créditos e pagamentos a 100%.
