import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [
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
})
export class AppModule {}
