import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { apiKeyMiddleware } from "./api-access/api-key.middleware.js";
import { ApiKeyService } from "./api-access/api-key.service.js";

/** Configuração HTTP partilhada entre main e testes. */
export function configureApp(app: NestExpressApplication) {
  // Upload de previews: corpo binário cru, limite 25 MB; na Vercel o corpo máximo é 4,5 MB (uploads diretos para S3/R2 resolvem isto) (o tipo real é validado pelos bytes).
  app.useBodyParser("raw", { type: ["image/jpeg", "image/png", "image/webp"], limit: process.env.VERCEL ? "4mb" : "25mb" });
  // Cabeçalhos de segurança (nosniff, frame, referrer, etc.). A API só devolve JSON/binário; sem CORS por omissão.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  // Chaves de API: autenticação, limite de taxa e atalhos sem orgId (antes do roteamento).
  app.use(apiKeyMiddleware(app.get(ApiKeyService)));
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
