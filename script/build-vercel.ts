import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, mkdir, rm, writeFile } from "fs/promises";
import path from "path";

// Builds directly into Vercel's Build Output API layout
// (https://vercel.com/docs/build-output-api/v3).
//
// The alternative — letting Vercel compile `api/index.ts` itself — means
// relying on its TypeScript handling to resolve our imports at runtime, and
// a failure there surfaces only as FUNCTION_INVOCATION_FAILED on the live
// site with no local equivalent. Bundling the function ourselves leaves
// Vercel nothing to resolve: it receives one self-contained JavaScript file.

const OUT = ".vercel/output";
const FUNC = `${OUT}/functions/api/index.func`;

async function buildAll() {
  await rm(OUT, { recursive: true, force: true });
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("copying static assets...");
  await mkdir(path.dirname(`${OUT}/static`), { recursive: true });
  await cp("dist/public", `${OUT}/static`, { recursive: true });

  console.log("bundling api function...");
  await mkdir(FUNC, { recursive: true });
  await esbuild({
    entryPoints: ["api/index.ts"],
    platform: "node",
    target: "node22",
    bundle: true,
    format: "cjs",
    outfile: `${FUNC}/index.js`,
    define: { "process.env.NODE_ENV": '"production"' },
    // Optional native addons that their parent packages require lazily
    // inside try/catch. Bundling them is neither possible nor necessary.
    external: ["pg-native", "bufferutil", "utf-8-validate"],
    logLevel: "info",
  });

  // The bundle is CommonJS, so the function directory must not inherit
  // "type": "module" from the repo's package.json.
  await writeFile(
    `${FUNC}/package.json`,
    JSON.stringify({ type: "commonjs" }, null, 2),
  );

  await writeFile(
    `${FUNC}/.vc-config.json`,
    JSON.stringify(
      {
        runtime: "nodejs22.x",
        handler: "index.js",
        launcherType: "Nodejs",
        // Express parses its own bodies; Vercel's helpers would consume the
        // request stream first.
        shouldAddHelpers: false,
        maxDuration: 15,
      },
      null,
      2,
    ),
  );

  await writeFile(
    `${OUT}/config.json`,
    JSON.stringify(
      {
        version: 3,
        routes: [
          // API first, then real files, then the SPA fallback for
          // client-side routes such as /airport/ATL.
          { src: "/api/(.*)", dest: "/api/index" },
          { handle: "filesystem" },
          { src: "/.*", dest: "/index.html" },
        ],
      },
      null,
      2,
    ),
  );

  console.log(`done -> ${OUT}`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
