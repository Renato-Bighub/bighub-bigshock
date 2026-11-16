import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { ErrorResponse } from "@bigstock/contracts";
import * as Sentry from "@sentry/node";
import type { Request, Response } from "express";

/** Formato único de erro: { error: { code, message }, request_id }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let code = status === 500 ? "internal_error" : "error";
    let message = status === 500 ? "Internal server error" : "Request failed";
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null) {
        const b = body as { code?: string; message?: string };
        code = b.code ?? (status === 429 ? "rate_limited" : code);
        const retry = (body as { retryAfter?: number }).retryAfter;
        if (typeof retry === "number") res.setHeader("Retry-After", String(retry));
        message = typeof b.message === "string" ? b.message : message;
      }
    }
    // Só erros de servidor (5xx) vão para o Sentry; erros do cliente (4xx) são esperados. Sem DSN é um no-op.
    if (status >= 500) Sentry.captureException(exception, { tags: { request_id: String(req.id) } });
    const payload: ErrorResponse = { error: { code, message }, request_id: String(req.id) };
    res.status(status).json(payload);
  }
}
