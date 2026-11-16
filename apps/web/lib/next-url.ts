/** Aceita apenas caminhos internos (evita redirecionamentos abertos). */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/dashboard";
}
