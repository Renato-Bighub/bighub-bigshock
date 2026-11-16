import { Module } from "@nestjs/common";
import { AiGenerationProcessor } from "./ai-generation.processor.js";

@Module({ providers: [AiGenerationProcessor] })
export class WorkerModule {}
