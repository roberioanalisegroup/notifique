/**
 * Helpers para Subresource Integrity (SRI) quando integrar CDN externo.
 * Para bundles Next auto-hospedados, use `npm run sri:hash -- caminho/ficheiro`.
 */
export function formatSriIntegrity(algorithm: "sha384" | "sha256", base64Hash: string): string {
  return `${algorithm}-${base64Hash}`;
}

export function sriScriptTag(src: string, integrity: string): string {
  return `<script src="${src}" integrity="${integrity}" crossorigin="anonymous"></script>`;
}
