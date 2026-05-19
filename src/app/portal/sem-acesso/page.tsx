import Link from "next/link";

export default function SemAcessoPage() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/90 px-6 py-10 text-center text-slate-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-50">
      <h1 className="text-xl font-bold text-amber-950 dark:text-amber-100">Sem permissão para esta área</h1>
      <p className="mt-3 text-sm text-amber-950/90 dark:text-amber-100/85">
        A sua conta não tem acesso a esta parte do portal. Peça ao administrador que ajuste as permissões de telas na
        secção Utilizadores, ou utilize apenas as áreas disponíveis no menu.
      </p>
      <Link
        href="/portal/dashboard"
        className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-500 dark:bg-primary dark:hover:bg-accent"
      >
        Ir ao dashboard
      </Link>
    </div>
  );
}
