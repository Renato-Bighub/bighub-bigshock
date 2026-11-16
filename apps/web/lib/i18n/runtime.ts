import { format } from "./config";
import type { Messages } from "./messages";

/**
 * Tradução fora do render (manipuladores de eventos, confirm(), erros de API). O fornecedor atualiza
 * as mensagens ativas no navegador. Nunca usar durante o render (no servidor seria partilhado entre pedidos).
 */
let active: Messages = {};
export const setRuntimeMessages = (m: Messages) => { active = m; };
export const rt = (text: string, vars?: Record<string, string | number>) => format(active[text] ?? text, vars);
