const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");

const USERSCRIPT_BANNER = `// ==UserScript==
// @name         OpenCode Go Stats
// @namespace    https://github.com/BubbleBuffer/opencode-go-stats
// @version      ${pkg.version}
// @description  Per-model token/cost analytics for opencode.ai workspace usage
// @author       BubbleBuffer
// @match        https://opencode.ai/*
// @icon         https://opencode.ai/favicon.ico
// @grant        none
// @run-at       document-end
// ==/UserScript==`;

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

  // Copy extension manifest
  fs.copyFileSync("extension/manifest.json", "dist/extension/manifest.json");
  console.log("Copied extension/manifest.json → dist/extension/manifest.json");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
