import type { NestExpressApplication } from "@nestjs/platform-express";

/** Configuração HTTP partilhada entre main e testes. */
export function configureApp(app: NestExpressApplication) {
  // Upload de previews: corpo binário cru, limite 10 MB (o tipo real é validado pelos bytes).
  app.useBodyParser("raw", { type: ["image/jpeg", "image/png", "image/webp"], limit: "10mb" });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}
