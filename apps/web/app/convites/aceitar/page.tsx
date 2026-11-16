import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getMe } from "@/lib/server-api";
import { AcceptForm } from "./accept-form";
import { T } from "@/components/i18n/provider";
import { getT } from "@/lib/i18n/server";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await getT();
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthShell title={t("Convite inválido")} subtitle="O link do convite está incompleto." footer={{ text: "", href: "/dashboard", label: "Ir para o dashboard" }}>
        <p className="text-sm text-nav/70"><T>Peça um novo convite a quem o enviou.</T></p>
      </AuthShell>
    );
  }
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/convites/aceitar?token=${token}`)}`);
  return (
    <AuthShell
      title={t("Aceitar convite")}
      subtitle={t("Sessão iniciada como {email}.", { email: me.user.email })}
      footer={{ text: "Email errado?", href: `/login?next=${encodeURIComponent(`/convites/aceitar?token=${token}`)}`, label: "Entrar com outra conta" }}
    >
      <p className="mb-4 text-sm text-nav/70"><T>O convite só pode ser aceite pela conta cujo email foi convidado.</T></p>
      <AcceptForm token={token} />
    </AuthShell>
  );
}
