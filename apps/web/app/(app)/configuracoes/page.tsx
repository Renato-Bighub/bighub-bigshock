import { getActiveOrg } from "@/lib/server-api";
import { getT } from "@/lib/i18n/server";
import { PasswordPanel } from "./password-panel";
import { PrivacyPanel } from "./privacy-panel";
import { T } from "@/components/i18n/provider";

export default async function SettingsPage() {
  const { me } = await getActiveOrg();
  const { t } = await getT();
  if (!me) return null;
  return (
    <div className="mx-auto max-w-3xl px-[19px] pt-[18px] pb-[30px]">
      <h1 className="text-2xl font-extrabold"><T>Configurações</T></h1>
      <p className="mt-1 mb-6 text-sm text-nav/60"><T>Conta e privacidade.</T></p>
      <section className="mb-6 rounded-[14px] border border-[#e0e3e9] bg-white p-5">
        <h2 className="mb-3 text-lg font-extrabold"><T>Conta</T></h2>
        <dl className="grid gap-1 text-sm sm:grid-cols-[120px_1fr]">
          <dt className="font-semibold"><T>Nome</T></dt><dd>{me.user.display_name ?? "—"}</dd>
          <dt className="font-semibold"><T>E-mail</T></dt><dd>{me.user.email} <span className="ml-2 text-xs text-nav/60">{me.user.email_verified ? t("verificado") : t("não verificado")}</span></dd>
        </dl>
      </section>
      <PasswordPanel />
      <PrivacyPanel />
    </div>
  );
}
