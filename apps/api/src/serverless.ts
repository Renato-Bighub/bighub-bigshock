import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let cached: Promise<Handler> | undefined;

/** Arranca o Nest uma vez por instância da função e reutiliza-o entre invocações. */
function boot(): Promise<Handler> {
  cached ??= (async () => {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  })().catch((err) => {
    cached = undefined; // permite nova tentativa após falha de arranque
    throw err;
  });
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await boot();
  app(req, res);
}
