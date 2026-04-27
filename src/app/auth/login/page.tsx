import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border p-6 text-sm">Carregando…</div>}>
      <LoginForm />
    </Suspense>
  );
}
