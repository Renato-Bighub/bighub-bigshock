# Deploy na Vercel

O repositório é um monorepo pnpm. Na Vercel criam-se **dois projetos** a partir do mesmo repositório:

| Projeto | Root Directory | O que é |
|---|---|---|
| `bigstock-web` | `apps/web` | Next.js (framework detetado) |
| `bigstock-api` | `apps/api` | NestJS como função serverless (`api/index.js` + bundle) |

Em ambos, ative **"Include source files outside of the Root Directory"** (já é o padrão) e use Node 22.
Os comandos de instalação e build estão nos `vercel.json` de cada app.

## Serviços externos (a Vercel não os hospeda)

- **PostgreSQL** (Neon, Supabase, RDS…) com extensão `pgvector` disponível. Use o URL *pooled* na API.
  As migrações precisam de um URL **direto** e de um papel que crie tabelas, triggers e o papel `bigstock_app`.
- **Armazenamento S3 ou Cloudflare R2** (obrigatório: o disco da Vercel é só de leitura).
- **Redis** (ex.: Upstash) — só necessário na Fase 4 (fila de geração).
- **Worker** (`apps/worker`, BullMQ): processo de longa duração, **não corre na Vercel**. Hospede-o em
  Railway, Fly.io ou Render quando a Fase 4 começar.

## Variáveis de ambiente

**Projeto `bigstock-api`**

| Variável | Notas |
|---|---|
| `APP_DATABASE_URL` | URL pooled do papel de aplicação (`bigstock_api`, membro de `bigstock_app`). Tem precedência sobre `DATABASE_URL`. A integração Neon da Vercel define `DATABASE_URL` com o utilizador **dono**; não o use para a API. O papel **não** pode ser superuser nem ter `BYPASSRLS` (senão o isolamento por organização é ignorado). |
| `DOWNLOAD_URL_SECRET` | Segredo longo e aleatório (obrigatório em produção). |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2: `S3_REGION=auto` e `S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com`. |
| `LOG_LEVEL`, `DB_POOL_MAX` | Opcionais (por omissão 3 ligações por instância na Vercel). |

**Projeto `bigstock-web`**

| Variável | Notas |
|---|---|
| `API_URL` | URL do projeto da API (ex.: `https://bigstock-api.vercel.app`). Precisa de estar definida **no build**: os rewrites `/api/*` são fixados nessa altura. |

O browser fala só com o domínio do web: `/api/*` é reescrito para a API, por isso o cookie de sessão fica na mesma origem.

## Pagamentos (Stripe)

Variáveis do projeto `bigstock-api` (sem `STRIPE_SECRET_KEY` a faturação responde 503 `billing_unavailable`; o resto da API funciona):

| Variável | Notas |
|---|---|
| `STRIPE_SECRET_KEY` | Chave secreta (`sk_test_…` em testes). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` do endpoint abaixo. Obrigatória se a chave existir. |
| `STRIPE_AUTOMATIC_TAX` | `true` só depois de configurar o Stripe Tax (morada de origem e registos de IVA). Ativa também a recolha de NIF/VAT e morada no checkout. |
| `WEB_URL` | URL público do web, usado nos redirecionamentos do checkout (ex.: `https://bighub-bigshock.vercel.app`). |

Webhook a criar no Stripe: `POST https://<api>/v1/webhooks/stripe` com os eventos
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
Os preços são criados no Stripe automaticamente (por `lookup_key`) a partir da tabela `plans`; a nossa BD é a fonte única.
Ative no Stripe o **Billing Portal** (Settings → Billing → Customer portal) para o botão "Gerir faturação".

## IA (geração de imagens) e worker

A API só **enfileira**; quem gera é o worker (`apps/worker`), um processo de longa duração que **não corre na Vercel**.
Sem `REDIS_URL` ou sem fornecedor configurado, a API responde 503 `ai_unavailable` e **não reserva créditos**.

**API (Vercel)**: `REDIS_URL` (TCP/TLS, ex.: Upstash `rediss://…`), `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` (opcional).

**Worker** (Railway, Fly.io ou Render): construa com `apps/worker/Dockerfile` (contexto = raiz do repositório) e defina as
mesmas variáveis **mais** `APP_DATABASE_URL`, `S3_*` e `REDIS_URL`. O worker precisa de acesso ao mesmo S3/R2 e ao mesmo Redis da API.
Em dev: `redis-server`, `pnpm dev:api` e `pnpm dev:worker` (partilham `apps/api/.storage`).

Conformidade (AI Act art. 50): cada geração regista fornecedor e modelo em `ai_jobs`, e os PNG levam metadados XMP/IPTC
(`DigitalSourceType = trainedAlgorithmicMedia`) + `tEXt` (`AIGenerated`, `AIProvider`, `AIModel`, `AIJobId`). **Não é uma assinatura C2PA.**
A interface sinaliza "Gerado por IA". Imagens geradas são privadas da organização e nunca entram no catálogo.

## API pública

Documentação: `https://<web>/docs` (Redoc) e especificação em `https://<api>/v1/openapi.json`.
Chaves `bk_live_…` criadas em **Integração via API** (proprietários/administradores; plano Business ou API Platform).
Limite por minuto por chave e quota mensal por organização usam contadores em PostgreSQL (funcionam entre instâncias serverless, sem Redis);
cada pedido faz 2 escritas de contador. A autenticação da chave é guardada em cache 15 s por instância, por isso revogar ou fazer downgrade
pode demorar até 15 s a valer em todas as instâncias. Não há SDK ainda (V1.1).

## Primeiro deploy

1. Crie o banco e um papel de aplicação sem superuser; guarde o URL direto como secret `DATABASE_URL_MIGRATE`
   (GitHub Environment `production`) e execute o workflow **Migrate database**.
2. Crie o bucket (R2/S3) e as credenciais.
3. Crie o projeto `bigstock-api`, defina as variáveis e faça deploy. Verifique `GET /v1/health`.
4. Crie o projeto `bigstock-web` com `API_URL` apontando para o passo 3 e faça deploy.
5. Para dar papel editorial a um utilizador: `UPDATE users SET platform_role = 'admin' WHERE email = '…';`

> O seed de catálogo (`seed:catalog`) é só para desenvolvimento e recusa correr com `NODE_ENV=production`.

## Limitações conhecidas em serverless

- **Corpo de pedido máx. 4,5 MB**: o upload de originais pela API fica limitado a 4 MB. Para ficheiros maiores
  é preciso upload direto para S3/R2 por URL pré-assinado (a fazer antes do import em massa).
- **Downloads** já redirecionam para URL assinado de 60 s do S3/R2, por isso não têm esse limite.
- **Rate limit** (`@nestjs/throttler`) é em memória por instância; para limites globais precisa de Redis (Fase 5).
- **Arranque a frio** do Nest: espere algumas centenas de ms no primeiro pedido de cada instância.

## Deploy pela CLI

`vercel deploy --prod` envia a árvore de trabalho (não só o que está commitado). O `.vercelignore` na raiz
exclui as imagens demonstrativas sem direitos (`apps/web/public/images/*.jpg`), o `.storage` e os `.env*`.
Para deploys automáticos a cada push use `vercel git connect` em cada projeto.
