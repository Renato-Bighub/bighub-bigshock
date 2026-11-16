import type { NestExpressApplication } from "@nestjs/platform-express";

/** Configuração HTTP partilhada entre main e testes. */
export function configureApp(app: NestExpressApplication) {
  // Upload de previews: corpo binário cru, limite 25 MB; na Vercel o corpo máximo é 4,5 MB (uploads diretos para S3/R2 resolvem isto) (o tipo real é validado pelos bytes).
  app.useBodyParser("raw", { type: ["image/jpeg", "image/png", "image/webp"], limit: process.env.VERCEL ? "4mb" : "25mb" });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
