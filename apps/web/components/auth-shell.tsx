import Link from "next/link";

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
      <section className="hidden flex-col justify-between bg-nav p-12 text-white lg:flex">
        <Brand dark />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">Milhões de imagens profissionais para os seus projetos.</h2>
          <p className="mt-4 max-w-md text-white/70">Fotos, vetores e imagens geradas por IA, com licença segura e comercial.</p>
        </div>
        <p className="text-sm text-white/50">Plataforma europeia · RGPD · EUR</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-nav/60">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-nav/60">
            {footer.text}{" "}
            <Link href={footer.href} className="font-semibold text-brand hover:underline">{footer.label}</Link>
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
      {pending ? "A processar…" : children}
    </button>
  );
}
