import type { NestExpressApplication } from "@nestjs/platform-express";

/** Configuração HTTP partilhada entre main e testes. */
export function configureApp(app: NestExpressApplication) {
  // Upload de previews: corpo binário cru, limite 25 MB (uploads diretos para S3/R2 substituem isto depois) (o tipo real é validado pelos bytes).
  app.useBodyParser("raw", { type: ["image/jpeg", "image/png", "image/webp"], limit: "25mb" });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
