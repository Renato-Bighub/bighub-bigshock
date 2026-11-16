// Empacota o JS compilado (tsc) num único ficheiro para a função serverless.
// esbuild não suporta emitDecoratorMetadata, por isso corre DEPOIS do tsc.
import { build } from "esbuild";

await build({
  entryPoints: ["dist/serverless.js"],
  outfile: "dist-bundle/serverless.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: [
    // binários nativos
    "@node-rs/argon2",
    // dependências opcionais do Nest carregadas dinamicamente (não usadas)
    "@nestjs/microservices",
    "@nestjs/websockets",
    "@nestjs/platform-socket.io",
    "class-validator",
    "class-transformer",
    "pg-native",
  ],
  logLevel: "info",
});
