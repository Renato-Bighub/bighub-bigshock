import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StorageService } from "../catalog/storage.service.js";
import { OrgGuard } from "../organizations/org.guard.js";
import { LicensingController } from "./licensing.controller.js";
import { LicensingService } from "./licensing.service.js";

@Module({ imports: [AuthModule], controllers: [LicensingController], providers: [LicensingService, StorageService, OrgGuard] })
export class LicensingModule {}
