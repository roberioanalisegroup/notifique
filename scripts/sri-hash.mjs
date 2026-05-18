#!/usr/bin/env node
/**
 * Gera hash SRI (sha384) para ficheiros estáticos externos (CDNs).
 * Uso: node scripts/sri-hash.mjs caminho/para/ficheiro.js
 * Saída: integrity="sha384-..." para usar em <script> ou <link>.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/sri-hash.mjs <ficheiro>");
  process.exit(1);
}

const path = resolve(file);
const content = readFileSync(path);
const hash = createHash("sha384").update(content).digest("base64");
const integrity = `sha384-${hash}`;

console.log(integrity);
console.log(`integrity="${integrity}" crossorigin="anonymous"`);
