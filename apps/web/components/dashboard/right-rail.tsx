import type { LicenseDto } from "@bigstock/contracts";
import Link from "next/link";
import { ChevronRight, Code2, Coins, Crown, Download, History, Plus, ShoppingCart, Sparkles, Zap } from "lucide-react";

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
  { icon: Sparkles, label: "Gerar nova imagem com IA" },
  { icon: Code2, label: "Integrar via API" },
  { icon: Plus, label: "Criar coleção" },
  { icon: History, label: "Ver histórico de geração" },
];

export function RightRail({ orgName, role, credits, planName, recent }: { orgName: string; role: string; credits: number | null; planName: string | null; recent: LicenseDto[] }) {
  const fmt = (n: number) => new Intl.NumberFormat("pt-PT").format(n);
  return (
    <aside className="flex min-w-0 flex-col gap-[13px]">
      <Card icon={<Crown size={20} className="text-[#ed9c00]" />} title="Minha organização">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <strong className="block truncate font-heading text-[22px] font-extrabold tracking-[-0.06em]">{orgName}</strong>
            <small className="mt-1 block text-[11px] leading-snug text-[#5b616c]">{ROLES[role] ?? role} · Plano {planName ?? "—"}</small>
          </div>
          <Link href="/planos" className="rounded-[9px] border border-[#d0002b] bg-white px-[15px] py-2.5 text-[13px] font-extrabold text-[#d0002b] hover:bg-[#fff0f3]">
            Gerir plano
          </Link>
        </div>
      </Card>

      <Card icon={<Coins size={21} className="text-brand" />} title="Créditos de IA">
        <div className="my-2 font-heading text-[29px] font-extrabold tracking-[-0.055em]">{credits === null ? "—" : fmt(credits)}</div>
        <div className="mb-[18px] text-[11px] text-[#343943]">Disponíveis</div>
        <Link href="/planos#creditos" className="flex min-h-[39px] w-full items-center justify-center gap-2 rounded-[9px] bg-brand text-[13px] font-extrabold text-white hover:bg-[#bd0024]">
          <ShoppingCart size={17} /> Comprar créditos
        </Link>
      </Card>

      <Card icon={<Zap size={21} className="text-brand" />} title="Ações rápidas">
        <div className="flex flex-col gap-[7px]">
          {ACTIONS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-lg border border-[#e3e6ea] px-3 py-2.5 text-[13px] text-[#16191d] opacity-60">
              <Icon size={18} /> <span className="flex-1">{label}</span> <ChevronRight size={18} />
            </div>
          ))}
        </div>
      </Card>

      <Card icon={<Download size={20} className="text-brand" />} title="Downloads recentes">
        {recent.length === 0 ? (
          <p className="m-0 py-2 text-[13px] text-[#5b616c]">Ainda sem downloads. Os seus ficheiros licenciados aparecerão aqui.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api${l.asset.preview_url}`} alt="" className="h-11 w-14 shrink-0 rounded-md bg-nav object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{l.asset.title}</p>
                  <p className="text-[11px] text-[#5b616c]">{new Date(l.created_at).toLocaleDateString("pt-PT")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href="/downloads" className="mt-3 block text-[13px] font-bold text-[#c5001f] hover:underline">Ver todos</Link>
      </Card>
    </aside>
  );
}
