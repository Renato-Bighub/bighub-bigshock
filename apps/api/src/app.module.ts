import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { HealthController } from "./health.controller.js";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/http-exception.filter.js";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./database.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.AUTH_RATE_LIMIT ?? 10) }]),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        // request_id propagado em logs e respostas (CLAUDE.md §5 e §8)
        genReqId: (req, res) => {
          const incoming = req.headers["x-request-id"];
          const id = typeof incoming === "string" && incoming.length <= 128 ? incoming : randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        redact: ["req.headers.authorization", "req.headers.cookie"],
      },
    }),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
