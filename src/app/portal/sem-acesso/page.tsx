import Link from "next/link";

type Props = {
  searchParams: Promise<{ area?: string; from?: string }>;
};

export default async function SemAcessoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const area = sp.area?.trim();
  const from = sp.from?.trim();

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/90 px-6 py-10 text-center text-slate-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-50">
      <h1 className="text-xl font-bold text-amber-950 dark:text-amber-100">Sem permissão para esta área</h1>
      {area ? (
        <p className="mt-3 text-sm font-medium text-amber-950/95 dark:text-amber-100/90">
          Área solicitada: <span className="text-amber-900 dark:text-amber-50">{area}</span>
        </p>
      ) : null}
      <p className="mt-3 text-sm text-amber-950/90 dark:text-amber-100/85">
        A sua conta não tem acesso a esta parte do portal. Peça ao administrador que ajuste as permissões de telas na
        secção Utilizadores, ou utilize apenas as áreas disponíveis no menu superior.
      </p>
      {from && from.startsWith("/portal") ? (
        <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/70">
          Caminho: <code className="rounded bg-amber-100/80 px-1 py-0.5 dark:bg-amber-900/50">{from}</code>
        </p>
      ) : null}
      <Link
        href="/portal/dashboard"
        className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-500 dark:bg-primary dark:hover:bg-accent"
      >
        Ir ao dashboard
      </Link>
    </div>
  );
}
