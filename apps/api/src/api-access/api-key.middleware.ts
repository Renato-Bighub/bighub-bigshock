import { HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { ApiKeyService, AuthenticatedKey } from "./api-key.service.js";

export type ApiKeyRequest = Request & { apiKey?: AuthenticatedKey };

// Rotas públicas sem organização: a chave já identifica a organização.
const ALIAS = /^\/v1\/(licenses|credits|ai|usage)(?=\/|\?|$)/;

/**
 * Autentica `Authorization: Bearer bk_…`, aplica limite de taxa/quota e reescreve os atalhos
 * (`/v1/ai/jobs` → `/v1/organizations/<org>/ai/jobs`). A lógica de negócio é a MESMA da web: só o canal muda.
 */
export function apiKeyMiddleware(service: ApiKeyService) {
  return async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer bk_")) return next();
    const requestId = (typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length <= 128 ? req.headers["x-request-id"] : randomUUID()) as string;
    req.headers["x-request-id"] = requestId;
    try {
      const key = await service.authenticate(header.slice(7));
      const rate = await service.meter(key);
      res.setHeader("X-RateLimit-Limit", String(rate.limit));
      res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
      res.setHeader("X-RateLimit-Reset", String(rate.resetEpochSeconds));
      req.apiKey = key;
      const m = ALIAS.exec(req.url);
      if (m) req.url = `/v1/organizations/${key.organizationId}${req.url.slice("/v1".length)}`;
      next();
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 500;
      const body = e instanceof HttpException ? (e.getResponse() as { code?: string; message?: string; retryAfter?: number }) : {};
      if (typeof body.retryAfter === "number") res.setHeader("Retry-After", String(body.retryAfter));
      res.setHeader("x-request-id", requestId);
      res.status(status).json({ error: { code: body.code ?? (status === 500 ? "internal_error" : "error"), message: status === 500 ? "Internal server error" : (body.message ?? "Request failed") }, request_id: requestId });
    }
  };
}
