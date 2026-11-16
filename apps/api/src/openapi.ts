import { z } from "zod";
import { aiJobBody, aiRequestBody, apiScopes, assetListQuery, licenseBody } from "@bigstock/contracts";

type Json = Record<string, unknown>;

const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: "openapi-3.0", io: "input", unrepresentable: "any" }) as Json;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (s: Json) => ({ "application/json": { schema: s } });
const envelope = (data: Json) => json({ type: "object", required: ["data", "request_id"], properties: { data, request_id: { type: "string" } } });
const list = (item: Json) => json({
  type: "object",
  required: ["data", "pagination", "request_id"],
  properties: { data: { type: "array", items: item }, pagination: ref("Pagination"), request_id: { type: "string" } },
});
const err = (description: string) => ({ description, content: json(ref("Error")) });
const idemKey = { name: "Idempotency-Key", in: "header", required: true, description: "8–128 caracteres. Repetir o pedido com a mesma chave devolve o mesmo resultado, sem duplicar cobrança.", schema: { type: "string", minLength: 8, maxLength: 128 } };
const pathParam = (name: string, desc = "") => ({ name, in: "path", required: true, description: desc, schema: { type: "string" } });
const cursorParams = [
  { name: "cursor", in: "query", schema: { type: "string" }, description: "`pagination.next_cursor` da página anterior." },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
];

const common = { 401: err("Chave inválida, revogada ou expirada"), 403: err("Escopo em falta ou plano sem acesso à API"), 429: err("Limite de pedidos por minuto excedido (ver Retry-After)") };

function op(summary: string, scope: string, extra: Json): Json {
  return { summary, "x-required-scope": scope, security: [{ bearerAuth: [scope] }], ...extra, responses: { ...(extra.responses as Json), ...common } };
}

/** Documento OpenAPI 3.1 da API pública. Os corpos de pedido derivam dos schemas zod partilhados (sem deriva). */
export function buildOpenApi(): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "BIGstock API",
      version: "1.0.0",
      description:
        "Catálogo de imagens, licenciamento e geração por IA. Autenticação por `Authorization: Bearer <chave>`. Toda resposta inclui `request_id`; listas usam paginação por cursor; operações pagas exigem `Idempotency-Key`. " +
        "Limites: pedidos por minuto por chave e quota mensal por organização, conforme o plano (cabeçalhos `X-RateLimit-*`; excesso devolve `429` com `Retry-After`).",
    },
    servers: [{ url: "/" }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: "Catálogo" }, { name: "Licenças" }, { name: "Créditos e uso" }, { name: "IA" }],
    paths: {
      "/v1/categories": { get: op("Listar categorias", "assets:read", { tags: ["Catálogo"], responses: { 200: { description: "OK", content: json({ type: "object", properties: { data: { type: "array", items: ref("Category") }, request_id: { type: "string" } } }) } } }) },
      "/v1/assets": { get: op("Pesquisar ativos publicados", "assets:read", { tags: ["Catálogo"], description: "Pesquisa textual em português e inglês, ordenada por relevância; sem `q`, mais recentes primeiro.", parameters: Object.entries((schema(assetListQuery).properties ?? {}) as Record<string, Json>).map(([name, s]) => ({ name, in: "query", schema: s })), responses: { 200: { description: "OK", content: list(ref("Asset")) } } }) },
      "/v1/assets/{id}": { get: op("Detalhe de um ativo", "assets:read", { tags: ["Catálogo"], parameters: [pathParam("id")], responses: { 200: { description: "OK", content: envelope(ref("Asset")) }, 404: err("Não encontrado ou não publicado") } }) },
      "/v1/assets/{id}/preview": { get: op("Pré-visualização do ativo (imagem)", "assets:read", { tags: ["Catálogo"], parameters: [pathParam("id")], responses: { 200: { description: "Imagem", content: { "image/*": { schema: { type: "string", format: "binary" } } } } } }) },
      "/v1/license-terms/current": { get: op("Termos de licença em vigor", "assets:read", { tags: ["Licenças"], responses: { 200: { description: "OK", content: envelope({ type: "object", properties: { version: { type: "string" }, title: { type: "string" }, summary: { type: "string" } } }) } } }) },
      "/v1/licenses": {
        post: op("Licenciar um ativo", "licenses:write", {
          tags: ["Licenças"],
          description: "Idempotente. Licenciar de novo o mesmo ativo devolve a licença existente. A licença regista a versão dos termos vigente.",
          parameters: [idemKey],
          requestBody: { required: true, content: json(schema(licenseBody)) },
          responses: { 201: { description: "Licença criada", content: envelope(ref("License")) }, 200: { description: "Licença já existente" }, 400: err("`Idempotency-Key` em falta ou pedido inválido"), 402: err("Quota de licenças do plano esgotada"), 404: err("Ativo não encontrado ou não publicado"), 409: err("`Idempotency-Key` usada para outro ativo") },
        }),
        get: op("Listar licenças", "licenses:read", { tags: ["Licenças"], parameters: cursorParams, responses: { 200: { description: "OK", content: list(ref("LicenseListItem")) } } }),
      },
      "/v1/licenses/{licenseId}/download": { post: op("Emitir URL de download assinado (60 s–5 min)", "licenses:write", { tags: ["Licenças"], parameters: [pathParam("licenseId")], responses: { 200: { description: "OK", content: envelope({ type: "object", properties: { url: { type: "string" }, expires_at: { type: "string", format: "date-time" } } }) }, 404: err("Licença não encontrada") } }) },
      "/v1/credits": { get: op("Saldo de créditos de IA", "credits:read", { tags: ["Créditos e uso"], responses: { 200: { description: "OK", content: envelope({ type: "object", properties: { available: { type: "integer" } } }) } } }) },
      "/v1/credits/ledger": { get: op("Livro de movimentos de créditos", "credits:read", { tags: ["Créditos e uso"], parameters: cursorParams, responses: { 200: { description: "OK", content: list({ type: "object" }) } } }) },
      "/v1/usage": { get: op("Consumo da API e limites", "usage:read", { tags: ["Créditos e uso"], responses: { 200: { description: "OK", content: envelope({ type: "object" }) } } }) },
      "/v1/ai/pricing": { get: op("Tabela de custos de IA", "ai:read", { tags: ["IA"], responses: { 200: { description: "OK" } } }) },
      "/v1/ai/estimate": { post: op("Estimar o custo (mostrar ao utilizador antes de confirmar)", "ai:generate", { tags: ["IA"], requestBody: { required: true, content: json(schema(aiRequestBody)) }, responses: { 200: { description: "OK" } } }) },
      "/v1/ai/jobs": {
        post: op("Criar geração/edição de imagem por IA", "ai:generate", {
          tags: ["IA"],
          description: "Reserva os créditos e enfileira o trabalho. `expectedCostCredits` deve igualar a estimativa (senão `409 cost_changed`). Falha técnica devolve os créditos. A edição exige um ativo licenciado por si e com `allows_ai_transform`.",
          parameters: [idemKey],
          requestBody: { required: true, content: json(schema(aiJobBody)) },
          responses: { 202: { description: "Aceite", content: envelope(ref("AiJob")) }, 200: { description: "Pedido repetido (mesma chave)" }, 402: err("`insufficient_credits`"), 409: err("`cost_changed` ou `idempotency_conflict`"), 422: err("Ativo não permite transformação por IA"), 503: err("IA indisponível; nada foi cobrado") },
        }),
        get: op("Listar trabalhos de IA", "ai:read", { tags: ["IA"], parameters: cursorParams, responses: { 200: { description: "OK", content: list(ref("AiJob")) } } }),
      },
      "/v1/ai/jobs/{jobId}": { get: op("Estado de um trabalho de IA", "ai:read", { tags: ["IA"], parameters: [pathParam("jobId")], responses: { 200: { description: "OK", content: envelope(ref("AiJob")) } } }) },
      "/v1/ai/jobs/{jobId}/output": { get: op("Imagem gerada (privada da organização)", "ai:read", { tags: ["IA"], parameters: [pathParam("jobId"), { name: "download", in: "query", schema: { type: "string" } }], responses: { 200: { description: "PNG com metadados de proveniência (conteúdo gerado por IA)", content: { "image/png": { schema: { type: "string", format: "binary" } } } } } }) },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: `Chave \`bk_live_…\`. Escopos: ${apiScopes.join(", ")}.` } },
      schemas: {
        Error: { type: "object", required: ["error", "request_id"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } }, request_id: { type: "string" } } },
        Pagination: { type: "object", required: ["next_cursor", "has_more"], properties: { next_cursor: { type: ["string", "null"] }, has_more: { type: "boolean" } } },
        Category: { type: "object", properties: { slug: { type: "string" }, namePt: { type: "string" }, nameEn: { type: "string" } } },
        Asset: { type: "object", properties: { id: { type: "string", format: "uuid" }, title: { type: "string" }, description: { type: ["string", "null"] }, kind: { enum: ["photo", "vector", "illustration"] }, category: { type: "string" }, tags: { type: "array", items: { type: "string" } }, width: { type: "integer" }, height: { type: "integer" }, allows_ai_transform: { type: "boolean" }, preview_url: { type: "string" }, published_at: { type: ["string", "null"], format: "date-time" } } },
        License: { type: "object", properties: { id: { type: "string", format: "uuid" }, asset_id: { type: "string", format: "uuid" }, created_at: { type: "string", format: "date-time" } } },
        LicenseListItem: { type: "object", properties: { id: { type: "string" }, created_at: { type: "string", format: "date-time" }, license_type: { type: "string" }, terms_version: { type: "string" }, asset: ref("Asset") } },
        AiJob: { type: "object", properties: { id: { type: "string", format: "uuid" }, kind: { enum: ["generate", "edit"] }, prompt: { type: "string" }, size: { type: "string" }, quality: { type: "string" }, status: { enum: ["queued", "running", "succeeded", "failed"] }, cost_credits: { type: "integer" }, error_code: { type: ["string", "null"] }, ai_generated: { const: true, description: "Conteúdo sintético (AI Act art. 50)." }, provider: { type: ["string", "null"] }, model: { type: ["string", "null"] }, output_url: { type: ["string", "null"] }, created_at: { type: "string", format: "date-time" }, finished_at: { type: ["string", "null"], format: "date-time" } } },
      },
    },
  };
}
