import { Global, Module } from "@nestjs/common";
import { createEmailProviderFromEnv, EMAIL_PROVIDER } from "./email.provider.js";
import { EmailService } from "./email.service.js";

@Global()
@Module({
  providers: [{ provide: EMAIL_PROVIDER, useFactory: createEmailProviderFromEnv }, EmailService],
  exports: [EmailService, EMAIL_PROVIDER],
})
export class MailModule {}
