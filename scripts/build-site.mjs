#!/usr/bin/env node
/**
 * Build the static GitHub Pages site in site/:
 *   site-src/viewer.ts  -> site/assets/app.js      (validator + FK + three.js scene + QR, from src/lib/arm/*)
 *   site-src/landing.ts -> site/assets/landing.js
 *   site-src/site.css   -> site/assets/site.css    (imports src/app/globals.css)
 * The list of site/examples/*.json is embedded as a fallback for when examples/index.json is absent.
 * Usage: npm run build:site  (add --watch to rebuild on change)
 */
import { build, context } from "esbuild";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const exDir = path.join(site, "examples");
const examples = existsSync(exDir)
  ? readdirSync(exDir).filter((f) => f.endsWith(".json") && f !== "index.json").sort()
  : [];

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ["es2020", "safari15", "firefox100", "chrome100"],
  logLevel: "info",
  legalComments: "eof",
  alias: { "@": path.join(root, "src") },
};

const configs = [
  {
    ...common,
    entryPoints: { app: path.join(root, "site-src/viewer.ts") },
    outdir: path.join(site, "assets"),
    format: "iife",
    platform: "browser",
    define: { __EXAMPLES__: JSON.stringify(examples) },
  },
  {
    ...common,
    entryPoints: { landing: path.join(root, "site-src/landing.ts") },
    outdir: path.join(site, "assets"),
    format: "iife",
    platform: "browser",
  },
  {
    ...common,
    entryPoints: { site: path.join(root, "site-src/site.css") },
    outdir: path.join(site, "assets"),
  },
];

if (process.argv.includes("--watch")) {
  for (const c of configs) await (await context(c)).watch();
  console.log("watching site-src/ and src/lib/ ...");
} else {
  await Promise.all(configs.map((c) => build(c)));
  console.log(`site built; ${examples.length} example(s) embedded: ${examples.join(", ") || "(none)"}`);
}
