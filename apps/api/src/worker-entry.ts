import "reflect-metadata";
import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Worker, type Job } from "bullmq";
import { aiGenerationJob, QUEUES } from "@bigstock/contracts";
import { AiRunnerService, RetryableError } from "./ai/ai-runner.service.js";
import { AiWorkerModule } from "./ai/ai.module.js";
import { redisConnection } from "./ai/job-queue.js";
import { BillingWorkerModule } from "./billing/billing.module.js";
import { DatabaseModule } from "./database.module.js";

/** Consumidor BullMQ: mesma lógica de negócio da API (monólito modular), processo separado. */
@Injectable()
class AiQueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiQueueConsumer.name);
  private worker?: Worker;

  constructor(private readonly runner: AiRunnerService) {}

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is required for the worker");
    this.worker = new Worker(QUEUES.aiGeneration, (job) => this.handle(job), {
      connection: redisConnection(url),
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    });
    this.worker.on("failed", (job, err) => {
      if (!(err instanceof RetryableError)) this.log.error({ msg: "job failed", id: job?.id, error: err.message });
    });
    this.worker.on("error", (err) => this.log.error(err.message));
    this.log.log("AI worker ready");
  }

  async handle(job: Job) {
    const { organizationId, aiJobId } = aiGenerationJob.parse(job.data);
    const attempts = job.opts.attempts ?? 1;
    const attemptsLeft = Math.max(0, attempts - (job.attemptsMade + 1));
    await this.runner.run(organizationId, aiJobId, attemptsLeft);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}

@Module({ imports: [DatabaseModule, BillingWorkerModule, AiWorkerModule], providers: [AiQueueConsumer] })
class WorkerModule {}

export async function startWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  return app;
}

export { AiRunnerService };
