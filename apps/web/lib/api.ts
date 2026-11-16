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
  invalid_invitation: "Convite inválido, expirado ou destinado a outro email. Inicie sessão com o email convidado.",
};

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? (MESSAGES[e.code] ?? e.message) : "Não foi possível contactar o servidor.";

export async function api<T = unknown>(path: string, body?: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? "Erro");
  return data as T;
}
