import { getActiveOrg } from "@/lib/server-api";
import { PrivacyPanel } from "./privacy-panel";

export default async function SettingsPage() {
  const { me } = await getActiveOrg();
  if (!me) return null;
  return (
    <div className="mx-auto max-w-3xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold">Configurações</h1>
      <p className="mt-1 mb-6 text-sm text-nav/60">Conta e privacidade.</p>
      <section className="mb-6 rounded-[14px] border border-[#e0e3e9] bg-white p-5">
        <h2 className="mb-3 text-lg font-extrabold">Conta</h2>
        <dl className="grid gap-1 text-sm sm:grid-cols-[120px_1fr]">
          <dt className="font-semibold">Nome</dt><dd>{me.user.display_name ?? "—"}</dd>
          <dt className="font-semibold">E-mail</dt><dd>{me.user.email}</dd>
        </dl>
      </section>
      <PrivacyPanel />
    </div>
  );
}
