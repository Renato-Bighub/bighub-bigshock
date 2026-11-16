import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Política de Privacidade — BIGstock" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updated="16 de novembro de 2026">
      <h2>1. Quem é o responsável</h2>
      <p>BIGstock by BIGhub <em>[identificação legal, morada, NIPC e e-mail do responsável pela privacidade — a completar]</em>. Tratamos dados pessoais ao abrigo do Regulamento Geral sobre a Proteção de Dados (RGPD).</p>

      <h2>2. Que dados tratamos e porquê</h2>
      <table>
        <thead><tr><th>Finalidade</th><th>Dados</th><th>Base legal</th></tr></thead>
        <tbody>
          <tr><td>Criar e gerir a sua conta e organização</td><td>E-mail, nome, senha (guardada só como hash), papel na organização</td><td>Execução do contrato</td></tr>
          <tr><td>Licenciar e descarregar imagens</td><td>Licenças concedidas, registos de download</td><td>Execução do contrato; obrigação legal (registos)</td></tr>
          <tr><td>Geração de imagens por IA</td><td>Descrições (prompts), imagens geradas, fornecedor/modelo usado</td><td>Execução do contrato</td></tr>
          <tr><td>Pagamentos e faturação</td><td>Identificação da organização, NIF/VAT, faturas e pagamentos (os dados do cartão ficam na Stripe)</td><td>Execução do contrato; obrigação legal fiscal</td></tr>
          <tr><td>Segurança e prevenção de abuso</td><td>Sessões, tentativas de início de sessão (e-mail em hash, IP), registos de auditoria</td><td>Interesse legítimo</td></tr>
          <tr><td>API pública</td><td>Chaves (guardadas só como hash), contagem de pedidos</td><td>Execução do contrato</td></tr>
        </tbody>
      </table>
      <p>Não vendemos dados pessoais. Usamos apenas cookies essenciais (sessão e organização ativa), por isso não mostramos um banner de consentimento.</p>

      <h2>3. Conservação</h2>
      <ul>
        <li>Conta e conteúdo da organização: enquanto a conta existir.</li>
        <li>Sessões e tentativas de início de sessão: eliminadas 30 dias após expirarem; contadores de uso da API: 90 dias.</li>
        <li>Registos financeiros, faturas e de auditoria: conservados pelo prazo legal aplicável, de forma pseudonimizada após a eliminação da conta.</li>
      </ul>

      <h2>4. Subcontratantes e transferências</h2>
      <table>
        <thead><tr><th>Subcontratante</th><th>Função</th><th>Localização</th></tr></thead>
        <tbody>
          <tr><td>Vercel</td><td>Alojamento da aplicação e da API</td><td>EUA/UE (CCT)</td></tr>
          <tr><td>Neon</td><td>Base de dados PostgreSQL</td><td>Região configurada</td></tr>
          <tr><td>Stripe</td><td>Pagamentos, faturas, cálculo de IVA</td><td>UE/EUA (CCT)</td></tr>
          <tr><td>OpenAI</td><td>Geração de imagens (só quando usa IA; recebe a descrição e, na edição, a imagem de referência)</td><td>EUA (CCT)</td></tr>
          <tr><td>Armazenamento de objetos (S3/R2)</td><td>Ficheiros de imagens</td><td>Região configurada</td></tr>
          <tr><td>Sentry</td><td>Deteção de erros (sem cookies, cabeçalhos de autenticação nem corpos de pedidos)</td><td>UE/EUA</td></tr>
        </tbody>
      </table>
      <p>As transferências para fora do EEE assentam em cláusulas contratuais-tipo e em medidas complementares. <em>[Confirmar acordos de tratamento de dados e regiões antes do lançamento.]</em></p>

      <h2>5. Conteúdo gerado por IA</h2>
      <p>As imagens geradas são privadas da sua organização, nunca entram no catálogo público e são identificadas como conteúdo gerado por IA, incluindo em metadados do ficheiro.</p>

      <h2>6. Os seus direitos</h2>
      <p>Pode aceder, retificar, exportar e eliminar os seus dados. Em <strong>Configurações → Privacidade e dados</strong> pode descarregar uma cópia em JSON e eliminar a conta. Também pode opor-se ao tratamento por interesse legítimo, limitá-lo e apresentar reclamação à CNPD (www.cnpd.pt). Para outros pedidos contacte <em>[e-mail do responsável pela privacidade]</em>; respondemos no prazo de um mês.</p>

      <h2>7. Segurança</h2>
      <p>Senhas com Argon2id, isolamento de dados por organização na base de dados, ligações cifradas, chaves de API guardadas apenas como hash, registos de auditoria imutáveis e minimização de dados nos registos de erros.</p>
    </LegalPage>
  );
}
