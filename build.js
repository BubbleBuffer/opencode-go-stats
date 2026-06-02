const esbuild = require("esbuild");
const pkg = require("./package.json");

const USERSCRIPT_BANNER = `// ==UserScript==
// @name         OpenCode Go Stats
// @namespace    https://github.com/BubbleBuffer/opencode-go-stats
// @version      ${pkg.version}
// @description  Per-model token/cost analytics for opencode.ai workspace usage
// @author       BubbleBuffer
// @match        https://opencode.ai/workspace/*/usage
// @icon         https://opencode.ai/favicon.ico
// @grant        none
// @run-at       document-end
// ==/UserScript==`;

async function build() {
  // Extension content script
  await esbuild.build({
    entryPoints: ["src/entries/extension.ts"],
    bundle: true,
    outfile: "extension/content.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    footer: { js: "void 0;" },
  });
  console.log("Built extension/content.js");

  // Console script
  await esbuild.build({
    entryPoints: ["src/entries/console.ts"],
    bundle: true,
    outfile: "pull-stats.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    footer: { js: "void 0;" },
  });
  console.log("Built pull-stats.js");

  // Userscript
  await esbuild.build({
    entryPoints: ["src/entries/extension.ts"],
    bundle: true,
    outfile: "opencode-stats.user.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    banner: { js: USERSCRIPT_BANNER },
    footer: { js: "void 0;" },
  });
  console.log("Built opencode-stats.user.js");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
