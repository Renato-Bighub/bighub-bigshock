# Imagens demonstrativas (não versionadas)

As fotografias desta pasta **não são commitadas**: são miniaturas de mockups usadas
apenas para desenvolver a interface e **não têm direitos de uso comercial ou de distribuição**.

Para ver o dashboard completo localmente, copie os ficheiros de
`BIGstock_Dashboard_React/public/images/` para esta pasta. Sem eles, a interface usa
fundos em gradiente.

Antes do lançamento, o catálogo deve vir de ativos BIGstock com direitos verificados
(`rights_records.verified_at`) servidos por CDN.

## Produção

Por decisão do dono do produto, o deploy pela CLI da Vercel **inclui** estas miniaturas para que o dashboard mostre imagens
enquanto o catálogo real (S3/R2) não está ligado. Deploys automáticos pelo Git **não** as incluem (não estão no repositório).
Substitua-as por ativos com direitos verificados antes do lançamento comercial.
