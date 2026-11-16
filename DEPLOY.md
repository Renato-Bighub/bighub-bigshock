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
| `DATABASE_URL` | URL pooled. O utilizador **não** pode ser superuser nem ter `BYPASSRLS` (senão o isolamento por organização é ignorado). |
| `DOWNLOAD_URL_SECRET` | Segredo longo e aleatório (obrigatório em produção). |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2: `S3_REGION=auto` e `S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com`. |
| `LOG_LEVEL`, `DB_POOL_MAX` | Opcionais (por omissão 3 ligações por instância na Vercel). |

**Projeto `bigstock-web`**

| Variável | Notas |
|---|---|
| `API_URL` | URL do projeto da API (ex.: `https://bigstock-api.vercel.app`). Precisa de estar definida **no build**: os rewrites `/api/*` são fixados nessa altura. |

O browser fala só com o domínio do web: `/api/*` é reescrito para a API, por isso o cookie de sessão fica na mesma origem.

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
