import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrgGuard } from "../organizations/org.guard.js";
import { ApiKeysController } from "./api-keys.controller.js";
import { ApiKeyService } from "./api-key.service.js";

@Global()
@Module({ imports: [AuthModule], controllers: [ApiKeysController], providers: [ApiKeyService, OrgGuard], exports: [ApiKeyService] })
export class ApiAccessModule {}
