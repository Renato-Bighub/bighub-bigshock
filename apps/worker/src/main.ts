// Worker de IA: processo de longa duração (não corre na Vercel).
// Reutiliza os módulos da API (monólito modular): mesma lógica de créditos e conformidade.
import { startWorker } from "@bigstock/api/worker";

await startWorker();
