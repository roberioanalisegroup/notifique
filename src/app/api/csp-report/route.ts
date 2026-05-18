/**
 * Recebe relatórios de violação CSP (report-uri / Reporting API).
 * Não exige autenticação; aceita apenas POST com corpo JSON limitado.
 */
export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 50_000) {
    return new Response(null, { status: 413 });
  }

  try {
    const raw = await request.text();
    if (raw.length > 50_000) {
      return new Response(null, { status: 413 });
    }
    if (raw && process.env.NODE_ENV !== "production") {
      console.warn("[csp-report]", raw.slice(0, 2000));
    }
  } catch {
    /* corpo inválido — ignorar */
  }

  return new Response(null, { status: 204 });
}
