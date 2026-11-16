import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrgGuard } from "../organizations/org.guard.js";
import { BillingController, WebhookController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { CreditsService } from "./credits.service.js";
import { EntitlementsService } from "./entitlements.service.js";
import { BILLING_PROVIDER, type BillingProvider } from "./provider.js";
import { createProviderFromEnv } from "./stripe.provider.js";
import { WebhookService } from "./webhook.service.js";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [BillingController, WebhookController],
  providers: [
    CreditsService,
    EntitlementsService,
    BillingService,
    WebhookService,
    OrgGuard,
    { provide: BILLING_PROVIDER, useFactory: (): BillingProvider => createProviderFromEnv() },
  ],
  exports: [CreditsService, EntitlementsService, BILLING_PROVIDER],
})
export class BillingModule {}
