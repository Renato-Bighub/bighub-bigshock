import { Global, Module } from "@nestjs/common";
import { CreditsService } from "./credits.service.js";
import { EntitlementsService } from "./entitlements.service.js";

@Global()
@Module({ providers: [CreditsService, EntitlementsService], exports: [CreditsService, EntitlementsService] })
export class BillingModule {}
