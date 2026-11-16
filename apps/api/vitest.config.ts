import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC é necessário para emitDecoratorMetadata (injeção de dependências do Nest).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], fileParallelism: false },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
