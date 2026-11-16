import Link from "next/link";
import { GridMotion } from "./grid-motion";
import { T } from "@/components/i18n/provider";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

// Miniaturas do catálogo demonstrativo (ver public/images/README.md). Substituir por ativos com direitos verificados.
const GRID_IMAGES = [
  "category-business", "fresh-coast", "category-people", "gallery-architecture", "category-nature", "fresh-barista", "category-technology",
  "gallery-lifestyle", "fresh-city", "category-food", "gallery-nature", "fresh-energy", "category-travel", "gallery-business",
  "fresh-vineyard", "gallery-logistics", "fresh-office", "gallery-ecommerce", "hero-city", "studio-office", "hero-logistics",
].map((n) => `/images/${n}.jpg`);

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`text-3xl font-extrabold tracking-tight ${dark ? "text-white" : "text-nav"}`}>
      BIG<span className="text-brand">stock</span>
      <span className={`ml-1 text-xs font-semibold ${dark ? "text-white/80" : "text-nav/70"}`}>by BIGhub</span>
    </span>
  );
}

export function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: { text: string; href: string; label: string };
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-nav p-12 text-white lg:flex">
        <GridMotion images={GRID_IMAGES} className="absolute inset-0 opacity-90" />
        {/* Véu para manter o texto legível sobre as imagens */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,16,21,.55)_0%,rgba(11,16,21,.88)_75%),linear-gradient(to_bottom,rgba(11,16,21,.85),rgba(11,16,21,.35)_45%,rgba(11,16,21,.9))]" />
        <div className="relative z-10"><Brand dark /></div>
        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold leading-tight [text-shadow:0_2px_12px_rgba(0,0,0,.6)]"><T>Milhões de imagens profissionais para os seus projetos.</T></h2>
          <p className="mt-4 max-w-md text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,.6)]"><T>Fotos, vetores e imagens geradas por IA, com licença segura e comercial.</T></p>
        </div>
        <p className="relative z-10 text-sm text-white/60"><T>Plataforma europeia · RGPD · EUR</T></p>
      </section>
      <section className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-nav/60"><T>{subtitle}</T></p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-nav/60">
            <T>{footer.text}</T>{" "}
            <Link href={footer.href} className="font-semibold text-brand hover:underline"><T>{footer.label}</T></Link>
          </p>
          <p className="mt-6 text-center text-xs text-nav/50">
            <Link href="/termos" className="hover:underline"><T>Termos</T></Link> · <Link href="/privacidade" className="hover:underline"><T>Privacidade</T></Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-nav/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand/90 disabled:opacity-60"
    >
      {pending ? <T>A processar…</T> : children}
    </button>
  );
}
