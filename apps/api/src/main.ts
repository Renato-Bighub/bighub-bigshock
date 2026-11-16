import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Atrás do proxy do Next: req.ip (rate limit) vem de X-Forwarded-For.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  await app.listen(Number(process.env.API_PORT ?? 3001));
}
void bootstrap();
