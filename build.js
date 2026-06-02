const esbuild = require("esbuild");

async function build() {
  // Extension content script
  await esbuild.build({
    entryPoints: ["src/extension.ts"],
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
    entryPoints: ["src/console.ts"],
    bundle: true,
    outfile: "pull-stats.js",
    format: "iife",
    target: ["chrome110", "firefox110"],
    platform: "browser",
    footer: { js: "void 0;" },
  });
  console.log("Built pull-stats.js");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
