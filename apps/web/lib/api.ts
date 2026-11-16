export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email ou senha incorretos.",
  email_taken: "Este email já está registado.",
  rate_limited: "Demasiadas tentativas. Aguarde um minuto e tente novamente.",
  validation_error: "Verifique os dados introduzidos.",
  already_member: "Este utilizador já é membro da organização.",
  last_owner: "A organização tem de manter pelo menos um proprietário.",
  forbidden: "Não tem permissão para esta ação.",
  not_found: "Recurso não encontrado.",
  billing_unavailable: "A faturação ainda não está configurada neste ambiente.",
  download_quota_exceeded: "Atingiu o limite de licenças do seu plano neste período. Faça upgrade em Planos e Créditos.",
  insufficient_credits: "Créditos insuficientes. Compre mais créditos em Planos e Créditos.",
  subscription_exists: "A organização já tem uma assinatura. Use \"Fazer upgrade\" ou \"Mudar no próximo ciclo\".",
  no_active_subscription: "Não existe uma assinatura ativa.",
  use_portal: "Para mudar o intervalo de faturação use o portal de faturação.",
  ai_unavailable: "A geração por IA não está disponível neste ambiente.",
  cost_changed: "O custo mudou. Reveja o valor e confirme novamente.",
  ai_transform_not_allowed: "Este ativo não permite transformação por IA.",
  content_rejected: "O pedido foi recusado pela política de conteúdo. Os créditos foram devolvidos.",
  generation_failed: "A geração falhou. Os créditos foram devolvidos.",
  provider_unavailable: "O serviço de IA está indisponível. Os créditos foram devolvidos.",
  enqueue_failed: "Não foi possível iniciar a geração. Os créditos foram devolvidos.",
  api_access_not_in_plan: "O seu plano não inclui acesso à API. Faça upgrade em Planos e Créditos.",
  sole_owner: "É o único proprietário de uma organização com outros membros. Transfira a propriedade (Equipa) antes de eliminar a conta.",
  invalid_token: "Esta ligação é inválida, expirou ou já foi usada. Peça uma nova.",
  too_soon: "Aguarde um minuto antes de pedir outro e-mail.",
  email_not_verified: "Confirme primeiro o seu e-mail (veja a faixa no topo da página) para aceitar convites.",
  no_billing_account: "Ainda não existe conta de faturação.",
  limit_reached: "Atingiu o limite máximo permitido.",
  invalid_invitation: "Convite inválido, expirado ou destinado a outro email. Inicie sessão com o email convidado.",
};

export const codeMessage = (code: string | null | undefined) => (code ? (MESSAGES[code] ?? code) : "");

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? (MESSAGES[e.code] ?? e.message) : "Não foi possível contactar o servidor.";

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? "Erro");
  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? "Erro");
  return data as T;
}
