import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import { aiGenerationJob, QUEUES } from "@bigstock/contracts";

/**
 * Processador da fila de geração por IA. Fase 4 implementa o adaptador de
 * fornecedor, o fecho da reserva (consume/release) e os metadados AI Act.
 */
@Injectable()
export class AiGenerationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiGenerationProcessor.name);
  private worker?: Worker;

  onModuleInit() {
    const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
    this.worker = new Worker(QUEUES.aiGeneration, (job) => this.handle(job), {
      connection: { host: url.hostname, port: Number(url.port || 6379) },
    });
    this.worker.on("error", (err) => this.log.error(err.message));
  }

  async handle(job: Job) {
    const payload = aiGenerationJob.parse(job.data);
    this.log.log({ msg: "ai job received", organizationId: payload.organizationId, aiJobId: payload.aiJobId });
    throw new Error("AI provider adapter not implemented (Phase 4)");
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
