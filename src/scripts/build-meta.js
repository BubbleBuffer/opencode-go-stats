const UPDATE_URL =
  "https://github.com/BubbleBuffer/opencode-go-stats/releases/latest/download/opencode-stats.meta.js";
const DOWNLOAD_URL =
  "https://github.com/BubbleBuffer/opencode-go-stats/releases/latest/download/opencode-stats.user.js";

/**
 * Build a userscript metadata block (header only, no script body).
 * @param {{ version: string }} pkg - Package object with version string.
 * @returns {string} Userscript metadata block.
 */
function buildUserscriptHeader(pkg) {
  return [
    "// ==UserScript==",
    "// @name         OpenCode Go Stats",
    "// @namespace    https://github.com/BubbleBuffer/opencode-go-stats",
    `// @version      ${pkg.version}`,
    "// @description  Per-model token/cost analytics for opencode.ai workspace usage",
    "// @author       BubbleBuffer",
    "// @match        https://opencode.ai/*",
    "// @icon         https://opencode.ai/favicon.ico",
    "// @grant        none",
    "// @run-at       document-end",
    `// @updateURL    ${UPDATE_URL}`,
    `// @downloadURL  ${DOWNLOAD_URL}`,
    "// ==/UserScript==",
  ].join("\n");
}

/**
 * Build the content for the standalone meta file (.meta.js).
 * Contains only the userscript metadata block with a trailing newline.
 * @param {{ version: string }} pkg
 * @returns {string} Metadata-only file content.
 */
function buildMetaFile(pkg) {
  return buildUserscriptHeader(pkg) + "\n";
}

module.exports = { buildUserscriptHeader, buildMetaFile };
