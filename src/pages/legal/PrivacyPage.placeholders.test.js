// @vitest-environment node
// Guard (WP26 Phase 4): the Privacy Policy must not ship with a placeholder.
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("Privacy Policy text", () => {
  it("has no unfilled [PLACEHOLDER] left in it", () => {
    const src = fs.readFileSync(new URL("./PrivacyPage.jsx", import.meta.url), "utf8");
    expect(src.match(/\[[A-Z][A-Z ]+:[^\]]*\]/g) ?? []).toEqual([]);
  });
});
