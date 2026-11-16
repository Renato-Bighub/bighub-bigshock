import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getMe } from "@/lib/server-api";
import { AcceptForm } from "./accept-form";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthShell title="Convite inválido" subtitle="O link do convite está incompleto." footer={{ text: "", href: "/dashboard", label: "Ir para o dashboard" }}>
        <p className="text-sm text-nav/70">Peça um novo convite a quem o enviou.</p>
      </AuthShell>
    );
  }
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/convites/aceitar?token=${token}`)}`);
  return (
    <AuthShell
      title="Aceitar convite"
      subtitle={`Sessão iniciada como ${me.user.email}.`}
      footer={{ text: "Email errado?", href: `/login?next=${encodeURIComponent(`/convites/aceitar?token=${token}`)}`, label: "Entrar com outra conta" }}
    >
      <p className="mb-4 text-sm text-nav/70">O convite só pode ser aceite pela conta cujo email foi convidado.</p>
      <AcceptForm token={token} />
    </AuthShell>
  );
}
