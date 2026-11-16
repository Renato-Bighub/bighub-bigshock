# RGPD — registo de tratamentos, direitos do titular e procedimentos

Rascunho técnico para o responsável pelo tratamento e para a revisão jurídica. Estado em 2026-11-16.
**Pontos entre `[colchetes]` dependem de decisão ou confirmação jurídica.**

## 1. Registo de atividades de tratamento (art. 30.º)

| Tratamento | Categorias de dados | Titulares | Base legal | Prazo de conservação | Destinatários |
|---|---|---|---|---|---|
| Contas e organizações | e-mail, nome, hash da senha, papel | utilizadores | execução do contrato | enquanto a conta existir; anonimizada na eliminação | Vercel, Neon |
| Sessões | hash do token, datas | utilizadores | execução do contrato / interesse legítimo (segurança) | eliminadas 30 dias após expirar/revogar | Vercel, Neon |
| Tentativas de login | hash do e-mail, IP, resultado | utilizadores/visitantes | interesse legítimo (segurança) | 30 dias | Vercel, Neon |
| Licenças e downloads | utilizador, ativo, versão dos termos, data | utilizadores | contrato; obrigação legal (prova de licença) | prazo legal de conservação; pseudonimizado após eliminação | Neon, S3/R2 |
| Geração por IA | prompts, imagens de referência/geradas, fornecedor/modelo | utilizadores | execução do contrato | enquanto a organização existir; removidos ao encerrar | OpenAI (só ao gerar), S3/R2, Neon |
| Pagamentos e faturação | NIF/VAT, organização, faturas, pagamentos | representantes das organizações | contrato; obrigação legal fiscal | prazo legal fiscal [confirmar: 10 anos em Portugal] | Stripe |
| API pública | chaves (hash), contagem de pedidos por minuto/mês | utilizadores | contrato | contagens por minuto 90 dias; mensais enquanto a conta existir | Vercel, Neon |
| Auditoria | ação, ator (pseudonimizado), recurso, `request_id` | utilizadores | interesse legítimo; obrigação legal | [definir; hoje sem limite — registos append-only] | Neon |
| Erros | exceções 5xx sem cookies/cabeçalhos de auth/corpos | — | interesse legítimo | [definir no Sentry] | Sentry (opcional) |

## 2. Subcontratantes e transferências internacionais

Vercel (alojamento), Neon (PostgreSQL), Stripe (pagamentos, faturas, IVA), OpenAI (geração de imagens), S3/R2 (ficheiros), Sentry (erros, opcional).
**A fazer:** assinar/aceitar os DPA de cada um, fixar regiões na UE onde possível (Vercel `functionDefaultRegions`, região do projeto Neon, região do bucket), e documentar cláusulas contratuais-tipo e avaliação de impacto da transferência para fornecedores nos EUA. A OpenAI recebe prompts e imagens de referência: informar no momento de usar a IA [avaliar aviso na interface].

## 3. Direitos dos titulares — implementação

| Direito | Como é exercido | Implementação |
|---|---|---|
| Acesso e portabilidade (arts. 15 e 20) | Configurações → "Descarregar os meus dados" | `GET /v1/me/export` — JSON com perfil, sessões (sem tokens), organizações, chaves criadas, convites enviados (sem e-mails de terceiros), licenças, downloads, prompts de IA e ações de auditoria do utilizador. Cada exportação fica auditada (`gdpr.export`). |
| Eliminação (art. 17) | Configurações → "Eliminar a conta" (senha + palavra "ELIMINAR") | `POST /v1/me/erase`: anonimiza o utilizador (e-mail `deleted-<id>@anonymized.invalid`, sem nome/senha), revoga sessões e chaves, remove o membro das organizações; **encerra** as organizações onde é o único membro (cancela a assinatura na Stripe, revoga chaves e convites, apaga prompts e ficheiros gerados, anonimiza o nome e o NIF da organização). Bloqueia com `sole_owner` se for o único proprietário de uma organização com outros membros. Fica auditada (`gdpr.erase`). |
| Retificação (art. 16) | [a implementar: edição de nome/e-mail na página Configurações] | — |
| Limitação e oposição (arts. 18 e 21) | Pedido ao responsável | [processo manual] |
| Reclamação | CNPD (www.cnpd.pt) | indicado na Política de Privacidade |

**Retenção legal vs. eliminação.** `credit_entries`, `payments`, `invoices`, `license_grants`, `download_events`, `audit_events` e `license_terms_versions` são append-only por desenho (e por obrigação legal/fiscal). Na eliminação o titular deixa de ser identificável porque a conta referenciada fica anonimizada; os registos permanecem. Documentar esta justificação ao titular (art. 17.º, n.º 3, alínea b).

## 4. Retenção automática

`GET /v1/internal/retention` (Vercel Cron diário às 03:00 UTC, protegido por `CRON_SECRET`) apaga sessões expiradas/revogadas há > 30 dias, tentativas de login > 30 dias e contadores de API por minuto > 90 dias. Defina `CRON_SECRET` no projeto da API.

## 5. Procedimento de pedidos do titular (DSAR)

1. Pedido por e-mail ou pela interface; confirmar a identidade (sessão autenticada ou verificação por e-mail).
2. Prazo de resposta: **1 mês** (prorrogável por 2 meses se complexo).
3. Exportação/eliminação self-service cobre a maioria dos casos; casos especiais (organizações partilhadas, retenção legal) tratados manualmente com registo.
4. Registar o pedido e a resposta (auditoria já regista exportações e eliminações).

## 5.1 Violações de dados (arts. 33.º e 34.º)

1. Detetar (Sentry, alertas, relato). 2. Conter (revogar chaves/sessões, rodar segredos). 3. Avaliar o risco para os titulares. 4. Notificar a CNPD **em 72 horas** se houver risco; informar os titulares se o risco for elevado. 5. Registar a violação, as causas e as medidas.
Apoio técnico: `audit_events` com `request_id`, logs estruturados por `organization_id`, sessões e chaves revogáveis, segredos só em variáveis de ambiente.

## 6. Medidas técnicas e organizativas (art. 32.º)

Argon2id; sessões opacas com hash; cookies HttpOnly/SameSite/Secure; RLS forçado por organização na base de dados (varredura em CI); papel da aplicação sem BYPASSRLS; chaves de API só como hash e com escopos; auditoria append-only; limites de taxa; cabeçalhos de segurança; minimização de dados no Sentry; backup e restauro com simulacro (`scripts/backup-restore-drill.sh`).

## 7. Lacunas RGPD que continuam abertas

- Identificação do responsável, morada, e-mail de privacidade e DPO (decidir se é obrigatório) nas páginas `/privacidade` e `/termos`.
- Retificação de dados na interface; verificação de e-mail (para pedidos feitos por e-mail e para convites).
- Prazo de conservação de auditoria e de erros; política para backups (os backups mantêm dados eliminados até expirarem: documentar o prazo).
- AIPD (avaliação de impacto) para a geração por IA com prompts livres.
- DPA assinados e regiões UE confirmadas (secção 2).
