import { Queue } from "bullmq";
import { QUEUES, type AiGenerationJob } from "@bigstock/contracts";

export const JOB_QUEUE = Symbol("JOB_QUEUE");

export interface JobQueue {
  readonly enabled: boolean;
  enqueue(job: AiGenerationJob): Promise<void>;
}

export function redisConnection(urlStr: string) {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null as null, // exigido pelo BullMQ Worker
  };
}

/** Fila BullMQ (Redis). O produtor corre na API; o consumidor no worker. */
export class BullJobQueue implements JobQueue {
  readonly enabled = true;
  private queue?: Queue;

  constructor(private readonly redisUrl: string) {}

  private get q(): Queue {
    this.queue ??= new Queue(QUEUES.aiGeneration, { connection: redisConnection(this.redisUrl) });
    return this.queue;
  }

  async enqueue(job: AiGenerationJob): Promise<void> {
    // jobId = id do ai_job: enfileirar duas vezes o mesmo trabalho é inócuo.
    await this.q.add("generate", job, {
      jobId: job.aiJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}

export class DisabledJobQueue implements JobQueue {
  readonly enabled = false;
  enqueue(): Promise<void> {
    throw new Error("queue not configured");
  }
}

export function createQueueFromEnv(): JobQueue {
  const url = process.env.REDIS_URL;
  return url ? new BullJobQueue(url) : new DisabledJobQueue();
}
