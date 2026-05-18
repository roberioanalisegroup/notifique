export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertServerSecretsNotPublic } = await import("@/lib/security/assert-env");
    assertServerSecretsNotPublic();
  }
}
