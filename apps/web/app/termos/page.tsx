import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Termos de Serviço — BIGstock" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Serviço" updated="16 de novembro de 2026">
      <h2>1. Serviço</h2>
      <p>O BIGstock disponibiliza um banco de imagens com licença comercial, um estúdio de geração de imagens por IA pago por créditos e uma API para integração. Estes termos regem o uso da plataforma por organizações e utilizadores.</p>

      <h2>2. Conta e organização</h2>
      <p>É responsável pela confidencialidade das credenciais e das chaves de API e pelas ações realizadas com elas. Cada organização tem os seus próprios dados, isolados das restantes.</p>

      <h2>3. Licenças de imagens</h2>
      <p>Cada licença é concedida a uma organização e rege-se pelos termos de licença em vigor no momento da concessão, que não se alteram retroativamente. Um pedido de remoção de direitos impede novas licenças mas não revoga licenças já concedidas, salvo decisão jurídica. Consulte os <em>[termos de licença vigentes — a rever juridicamente]</em> no momento de licenciar.</p>

      <h2>4. Geração por IA e créditos</h2>
      <p>O custo em créditos é apresentado antes de confirmar. Os créditos são reservados no pedido e consumidos na entrega; falhas técnicas sem entrega devolvem os créditos. Créditos incluídos no plano não acumulam entre períodos e créditos comprados têm validade própria. Só pode editar imagens que tenha licenciado e cujos direitos permitam transformação por IA. É proibido gerar conteúdo ilegal ou que viole direitos de terceiros.</p>

      <h2>5. Planos, pagamentos e faturação</h2>
      <p>As assinaturas renovam automaticamente. Upgrades aplicam-se de imediato com valor proporcional; downgrades aplicam-se no ciclo seguinte. Em caso de pagamento falhado há um período de nova tentativa antes de suspender operações pagas; o acesso a faturas e a conteúdos já adquiridos mantém-se sempre. O IVA é calculado no checkout.</p>

      <h2>6. API</h2>
      <p>O acesso à API depende do plano e está sujeito a limites de pedidos e quotas. Pode ser suspenso em caso de abuso.</p>

      <h2>7. Responsabilidade e alterações</h2>
      <p><em>[Limitações de responsabilidade, lei aplicável e foro — a definir com assessoria jurídica.]</em> Podemos atualizar estes termos; alterações materiais serão comunicadas com antecedência razoável.</p>
    </LegalPage>
  );
}
