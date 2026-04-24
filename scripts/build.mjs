// Bundle the project into a single Node-runnable JS file using esbuild.
// All runtime deps are pure JS and get fully inlined — the output is a true
// single-file artifact with no accompanying node_modules required.

import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outdir = resolve(root, "dist");
const outfile = resolve(outdir, "ollama-bridger.js");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await build({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: true,
  sourcemap: true,
  legalComments: "none",
  banner: {
    // ESM bundles need shims for __dirname / require when downstream code
    // (or transitive deps) reaches for CJS-only globals.
    js: [
      "import { createRequire as __bridgerCreateRequire } from 'node:module';",
      "import { fileURLToPath as __bridgerFileURLToPath } from 'node:url';",
      "import { dirname as __bridgerDirname } from 'node:path';",
      "const require = __bridgerCreateRequire(import.meta.url);",
      "const __filename = __bridgerFileURLToPath(import.meta.url);",
      "const __dirname = __bridgerDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
  metafile: true,
});

const inputs = Object.keys(result.metafile.inputs).length;
console.log(`\n✅ Bundled ${inputs} modules → ${outfile}`);
