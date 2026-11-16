// Documentação pública da API (OpenAPI) renderizada com Redoc, versão fixada.
const HTML = `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BIGstock API — Documentação</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <style>body{margin:0}</style>
</head>
<body>
  <redoc spec-url="/api/v1/openapi.json" hide-hostname></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js"></script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
