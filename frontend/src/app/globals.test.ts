// @vitest-environment node
// jsdom applies no stylesheet, so the focus rule is checked where it is written.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

/** The declarations of the top-level :focus-visible rule. */
function focusRule(): string {
  const match = /^:focus-visible\s*\{([^}]*)\}/m.exec(css);
  if (!match) throw new Error("globals.css has no top-level :focus-visible rule");
  return match[1];
}

describe("globals.css :focus-visible", () => {
  it("draws the brand focus ring", () => {
    expect(focusRule()).toMatch(/outline:\s*2px solid var\(--color-focus\)/);
  });

  // A control with transition-colors would otherwise fade its outline in from the
  // background colour: on a white surface the ring is invisible for the first moments.
  it("keeps the outline out of any transition, so the ring appears at once", () => {
    const property = /transition-property:\s*([^;]+);/.exec(focusRule())?.[1] ?? "";

    expect(property).not.toBe("");
    expect(property).not.toMatch(/outline|all/);
  });
});
