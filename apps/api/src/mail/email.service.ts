import { Inject, Injectable } from "@nestjs/common";
import { EMAIL_PROVIDER, type EmailProvider } from "./email.provider.js";
import { invitationTemplate, passwordChangedTemplate, passwordResetTemplate, verifyEmailTemplate, type Rendered } from "./email.templates.js";

const webUrl = () => (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");

@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  /** O e-mail é realmente entregue (não é consola/desligado)? */
  get delivers() {
    return this.provider.delivers;
  }

  private async send(to: string, r: Rendered): Promise<boolean> {
    return this.provider.send({ to, subject: r.subject, html: r.html, text: r.text });
  }

  sendVerification(to: string, name: string | null, token: string) {
    return this.send(to, verifyEmailTemplate(name, `${webUrl()}/verificar-email?token=${token}`));
  }
  sendPasswordReset(to: string, name: string | null, token: string) {
    return this.send(to, passwordResetTemplate(name, `${webUrl()}/redefinir-senha?token=${token}`));
  }
  sendPasswordChanged(to: string, name: string | null) {
    return this.send(to, passwordChangedTemplate(name));
  }
  /** Devolve true só se foi entregue por um fornecedor real. */
  async sendInvitation(to: string, inviter: string, org: string, token: string): Promise<boolean> {
    const ok = await this.send(to, invitationTemplate(inviter, org, `${webUrl()}/convites/aceitar?token=${token}`));
    return ok && this.provider.delivers;
  }
}
