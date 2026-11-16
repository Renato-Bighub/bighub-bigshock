import { Logger } from "@nestjs/common";

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Fornecedor de e-mail transacional. `delivers` indica entrega real (Resend, etc.): só então o
 * servidor deixa de devolver tokens de convite à API e exige e-mail verificado.
 */
export interface EmailProvider {
  readonly name: string;
  readonly delivers: boolean;
  send(msg: EmailMessage): Promise<boolean>;
}

/** Desenvolvimento/testes: não envia; regista na consola (sem destinatário completo) e guarda na caixa de saída em memória. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  readonly delivers = false;
  readonly outbox: EmailMessage[] = [];
  private readonly log = new Logger("Email");

  async send(msg: EmailMessage): Promise<boolean> {
    this.outbox.push(msg);
    this.log.log(`[console] "${msg.subject}" → ${msg.to.replace(/^(.).*(@.*)$/, "$1***$2")}`);
    // Só em desenvolvimento: mostra o conteúdo (links com tokens) para testar os fluxos sem fornecedor.
    if (process.env.NODE_ENV !== "production") this.log.log(`[console:body] ${msg.text}`);
    return true;
  }
}

export class DisabledEmailProvider implements EmailProvider {
  readonly name = "disabled";
  readonly delivers = false;
  async send(): Promise<boolean> {
    return false;
  }
}

/** Resend (https://resend.com), API REST. Aconselha-se a região UE e um domínio verificado (SPF/DKIM). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  readonly delivers = true;
  private readonly log = new Logger("Email");

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(msg: EmailMessage): Promise<boolean> {
    try {
      const res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.log.warn(`resend responded ${res.status}`); // sem corpo nem destinatário nos logs (minimização de dados)
        return false;
      }
      return true;
    } catch (e) {
      this.log.warn(`resend request failed: ${(e as Error).name}`);
      return false;
    }
  }
}

export function createEmailProviderFromEnv(): EmailProvider {
  const choice = process.env.EMAIL_PROVIDER ?? (process.env.NODE_ENV === "production" ? (process.env.RESEND_API_KEY ? "resend" : "disabled") : "console");
  if (choice === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend");
    return new ResendEmailProvider(key, from);
  }
  if (choice === "console") return new ConsoleEmailProvider();
  return new DisabledEmailProvider();
}
