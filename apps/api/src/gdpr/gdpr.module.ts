import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StorageService } from "../catalog/storage.service.js";
import { GdprController } from "./gdpr.controller.js";
import { GdprService } from "./gdpr.service.js";

@Module({ imports: [AuthModule], controllers: [GdprController], providers: [GdprService, StorageService] })
export class GdprModule {}
