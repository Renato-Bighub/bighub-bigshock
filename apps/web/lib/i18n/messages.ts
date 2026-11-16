import type { Locale } from "./config";
import { de } from "./messages/de";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";

/** Chave = texto original em português. Sem entrada, mostra-se o português. */
export type Messages = Record<string, string>;
export const MESSAGES: Record<Exclude<Locale, "pt">, Messages> = { en, es, fr, de };
export const messagesFor = (l: Locale): Messages => (l === "pt" ? {} : MESSAGES[l]);
