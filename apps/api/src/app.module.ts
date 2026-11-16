import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { HealthController } from "./health.controller.js";
import { OpenApiController } from "./openapi.controller.js";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/http-exception.filter.js";
import { AuthModule } from "./auth/auth.module.js";
import { ApiAccessModule } from "./api-access/api-access.module.js";
import { AiModule } from "./ai/ai.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { LicensingModule } from "./licensing/licensing.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { DatabaseModule } from "./database.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    CatalogModule,
    LicensingModule,
    BillingModule,
    AiModule,
    ApiAccessModule,
    ThrottlerModule.forRootAsync({ useFactory: () => [{ ttl: 60_000, limit: Number(process.env.AUTH_RATE_LIMIT ?? 10) }] }),
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
  controllers: [HealthController, OpenApiController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
