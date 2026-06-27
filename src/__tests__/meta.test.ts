import { describe, it, expect } from "vitest";
import { buildUserscriptHeader, buildMetaFile } from "../scripts/build-meta";

describe("buildUserscriptHeader", () => {
  const pkg = { version: "1.2.3" };

  it("returns a complete userscript metadata block", () => {
    const header = buildUserscriptHeader(pkg);
    expect(header.startsWith("// ==UserScript==")).toBe(true);
    expect(header.endsWith("// ==/UserScript==")).toBe(true);
  });

  it("includes @version from package.json", () => {
    const header = buildUserscriptHeader(pkg);
    expect(header).toContain("@version      1.2.3");
  });

  it("includes @updateURL and @downloadURL", () => {
    const header = buildUserscriptHeader(pkg);
    expect(header).toContain(
      "@updateURL    https://github.com/BubbleBuffer/opencode-go-stats/releases/latest/download/opencode-stats.meta.js"
    );
    expect(header).toContain(
      "@downloadURL  https://github.com/BubbleBuffer/opencode-go-stats/releases/latest/download/opencode-stats.user.js"
    );
  });
});

describe("buildMetaFile", () => {
  const pkg = { version: "2.0.0" };

  it("returns only metadata block with no script body", () => {
    const content = buildMetaFile(pkg);
    expect(content).toContain("@version      2.0.0");
    expect(content).toContain("@updateURL");
    expect(content).toContain("@downloadURL");
    // Should NOT contain any JS code
    expect(content).not.toContain("use strict");
    expect(content).not.toContain("void 0");
    // Should not contain empty script wrappers beyond the header
    expect(content).toBe(
      buildUserscriptHeader(pkg) + "\n"
    );
  });
});
