import * as Sentry from "@sentry/node";

/** Observabilidade (CLAUDE.md §2): Sentry quando SENTRY_DSN está definido; caso contrário não faz nada. */
export function initObservability() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || Sentry.isInitialized()) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Minimização de dados (RGPD): sem IPs, cookies nem corpos de pedido.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
        }
      }
      return event;
    },
  });
}
