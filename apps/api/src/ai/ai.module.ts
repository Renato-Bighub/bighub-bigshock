import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StorageService } from "../catalog/storage.service.js";
import { OrgGuard } from "../organizations/org.guard.js";
import { AiController } from "./ai.controller.js";
import { AiRunnerService } from "./ai-runner.service.js";
import { AiService } from "./ai.service.js";
import { FakeImageProvider } from "./fake.provider.js";
import { DisabledImageProvider, IMAGE_PROVIDER, type ImageProvider } from "./image-provider.js";
import { createQueueFromEnv, JOB_QUEUE } from "./job-queue.js";
import { OpenAiImageProvider } from "./openai.provider.js";

/** Escolha do fornecedor por ambiente. Em produção exige configuração explícita (nunca cai no falso). */
export function createImageProviderFromEnv(): ImageProvider {
  const choice = process.env.AI_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "fake");
  if (choice === "openai") {
    const key = process.env.OPENAI_API_KEY;
    return key ? new OpenAiImageProvider(key, process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2") : new DisabledImageProvider();
  }
  if (choice === "fake") return new FakeImageProvider();
  return new DisabledImageProvider();
}

const providers = [
  { provide: IMAGE_PROVIDER, useFactory: createImageProviderFromEnv },
  { provide: JOB_QUEUE, useFactory: createQueueFromEnv },
  StorageService,
  AiRunnerService,
];

/** Módulo da API: HTTP + produtor da fila. */
@Module({ imports: [AuthModule], controllers: [AiController], providers: [AiService, OrgGuard, ...providers], exports: [AiRunnerService, IMAGE_PROVIDER, JOB_QUEUE] })
export class AiModule {}

/** Módulo do worker: sem HTTP; só o executor. */
@Module({ providers, exports: [AiRunnerService] })
export class AiWorkerModule {}
