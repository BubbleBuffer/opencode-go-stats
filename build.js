const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");
const { buildUserscriptHeader, buildMetaFile } = require("./src/scripts/build-meta");

const USERSCRIPT_BANNER = buildUserscriptHeader(pkg);

async function build() {
  fs.mkdirSync("dist/extension", { recursive: true });

  // Extension content script
  await esbuild.build({
    entryPoints: ["src/entries/extension.ts"],
    bundle: true,
    outfile: "dist/extension/content.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    footer: { js: "void 0;" },
  });
  console.log("Built dist/extension/content.js");

  // Console script
  await esbuild.build({
    entryPoints: ["src/entries/console.ts"],
    bundle: true,
    outfile: "dist/pull-stats.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    footer: { js: "void 0;" },
  });
  console.log("Built dist/pull-stats.js");

  // Userscript
  await esbuild.build({
    entryPoints: ["src/entries/extension.ts"],
    bundle: true,
    outfile: "dist/opencode-stats.user.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    banner: { js: USERSCRIPT_BANNER },
    footer: { js: "void 0;" },
  });
  console.log("Built dist/opencode-stats.user.js");

  // Userscript metadata-only file (for auto-update polling)
  fs.writeFileSync("dist/opencode-stats.meta.js", buildMetaFile(pkg), "utf-8");
  console.log("Built dist/opencode-stats.meta.js");

  // Copy extension manifest
  fs.copyFileSync("extension/manifest.json", "dist/extension/manifest.json");
  console.log("Copied extension/manifest.json → dist/extension/manifest.json");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
