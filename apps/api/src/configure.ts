import type { NestExpressApplication } from "@nestjs/platform-express";
import { apiKeyMiddleware } from "./api-access/api-key.middleware.js";
import { ApiKeyService } from "./api-access/api-key.service.js";

/** Configuração HTTP partilhada entre main e testes. */
export function configureApp(app: NestExpressApplication) {
  // Upload de previews: corpo binário cru, limite 25 MB; na Vercel o corpo máximo é 4,5 MB (uploads diretos para S3/R2 resolvem isto) (o tipo real é validado pelos bytes).
  app.useBodyParser("raw", { type: ["image/jpeg", "image/png", "image/webp"], limit: process.env.VERCEL ? "4mb" : "25mb" });
  // Chaves de API: autenticação, limite de taxa e atalhos sem orgId (antes do roteamento).
  app.use(apiKeyMiddleware(app.get(ApiKeyService)));
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
