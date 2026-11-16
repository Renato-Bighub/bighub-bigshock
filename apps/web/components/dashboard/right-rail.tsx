import type { LicenseDto } from "@bigstock/contracts";
import Link from "next/link";
import { ChevronRight, Code2, Coins, Crown, Download, History, Plus, ShoppingCart, Sparkles, Zap } from "lucide-react";
import { T } from "@/components/i18n/provider";
import { getT } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/config";

const ROLES: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro", billing: "Faturação" };

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[#e0e3e9] bg-white p-[17px_18px] shadow-[0_1px_3px_rgba(12,19,25,.035)]">
      <div className="mb-3 flex items-center gap-3">
        {icon}
        <h3 className="m-0 text-[15px] font-extrabold tracking-[-0.035em]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

const ACTIONS = [
  { icon: Sparkles, label: "Gerar nova imagem com IA", href: "/gerar" },
  { icon: Code2, label: "Integrar via API", href: "/integracao" },
  { icon: Plus, label: "Criar coleção", href: "/colecoes" },
  { icon: History, label: "Ver histórico de geração", href: "/historico" },
];

export async function RightRail({ orgName, role, credits, planName, recent }: { orgName: string; role: string; credits: { available: number; plan: number; plan_expires_at: string | null; own: number } | null; planName: string | null; recent: LicenseDto[] }) {
  const { t, locale } = await getT();
  const intl = intlLocale(locale);
  const fmt = (n: number) => new Intl.NumberFormat(intl).format(n);
  return (
    <aside className="flex min-w-0 flex-col gap-[13px]">
      <Card icon={<Crown size={20} className="text-[#ed9c00]" />} title={t("Minha organização")}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <strong className="block truncate font-heading text-[22px] font-extrabold tracking-[-0.06em]">{orgName}</strong>
            <small className="mt-1 block text-[11px] leading-snug text-[#5b616c]">{t(ROLES[role] ?? role)} <T>· Plano</T> {planName ?? "—"}</small>
          </div>
          <Link href="/planos" className="rounded-[9px] border border-[#d0002b] bg-white px-[15px] py-2.5 text-[13px] font-extrabold text-[#d0002b] hover:bg-[#fff0f3]">
            <T>Gerir plano</T>
          </Link>
        </div>
      </Card>

      <Card icon={<Coins size={21} className="text-brand" />} title={t("Créditos de IA")}>
        <div className="my-2 font-heading text-[29px] font-extrabold tracking-[-0.055em]">{credits === null ? "—" : fmt(credits.available)}</div>
        <div className="mb-3 text-[11px] text-[#343943]"><T>Disponíveis no total</T></div>
        {credits && (
          <dl className="mb-[18px] space-y-1.5 rounded-lg bg-[#f6f7f9] px-3 py-2.5 text-[12px] text-[#343943]">
            <div className="flex justify-between gap-2"><dt><T>Meus créditos</T></dt><dd className="font-bold">{fmt(credits.own)}</dd></div>
            <div className="flex justify-between gap-2">
              <dt><T>Do plano</T>{planName ? ` ${planName}` : ""}</dt>
              <dd className="font-bold">{fmt(credits.plan)}</dd>
            </div>
            {credits.plan > 0 && credits.plan_expires_at && (
              <p className="pt-0.5 text-[11px] text-[#5b616c]"><T>Os do plano expiram em</T> {new Date(credits.plan_expires_at).toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}.</p>
            )}
          </dl>
        )}
        <Link href="/planos#creditos" className="flex min-h-[39px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand text-[13px] font-extrabold text-white hover:bg-[#bd0024]">
          <ShoppingCart size={17} /> <T>Comprar créditos</T>
        </Link>
      </Card>

      <Card icon={<Zap size={21} className="text-brand" />} title={t("Ações rápidas")}>
        <div className="flex flex-col gap-[7px]">
          {ACTIONS.map(({ icon: Icon, label, href }) => {
            const inner = (<><Icon size={18} /> <span className="flex-1">{t(label)}</span> <ChevronRight size={18} /></>);
            const cls = "flex items-center gap-2.5 rounded-lg border border-[#e3e6ea] px-3 py-2.5 text-[13px] text-[#16191d]";
            return href ? (
              <Link key={label} href={href} className={`${cls} hover:border-brand`}>{inner}</Link>
            ) : (
              <div key={label} className={`${cls} opacity-60`}>{inner}</div>
            );
          })}
        </div>
      </Card>

      <Card icon={<Download size={20} className="text-brand" />} title={t("Downloads recentes")}>
        {recent.length === 0 ? (
          <p className="m-0 py-2 text-[13px] text-[#5b616c]"><T>Ainda sem downloads. Os seus ficheiros licenciados aparecerão aqui.</T></p>
        ) : (
          <ul className="space-y-2">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api${l.asset.preview_url}`} alt="" className="h-11 w-14 shrink-0 rounded-md bg-nav object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{l.asset.title}</p>
                  <p className="text-[11px] text-[#5b616c]">{new Date(l.created_at).toLocaleDateString(intl)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href="/downloads" className="mt-3 block text-[13px] font-bold text-[#c5001f] hover:underline"><T>Ver todos</T></Link>
      </Card>
    </aside>
  );
}
