// @vitest-environment node
// Real-PDF check (WP26 Phase 2 / TODO 9.10 part A). Skipped unless
// GRIPTRACK_TESTDOCS points at a folder of rental PDFs. Those are customer
// documents: they stay on Chris's machine, nothing from them is committed,
// and this test prints only file names and row counts.
//
//   GRIPTRACK_TESTDOCS=~/Documents/GripTrack-assets/TestDocs npx vitest run supabase/functions/_shared/pdf/realDocs.test.js
//
// Each PDF is parsed twice with the shared parser: with the web's pdf.js
// (pdfjs-dist) and with the edge function's (pdfjs-serverless), and the test
// fails if the rows differ, because web and mobile would import different
// things. Optional: an expected.json in that folder, { "<file name>": <row
// count> }, also pins the count (e.g. 46 for the S4 list).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = process.env.GRIPTRACK_TESTDOCS;
const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "parseWith.mjs");

const parseWith = (which, file) =>
  JSON.parse(execFileSync(process.execPath, [helper, which, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

describe.skipIf(!dir)("real rental PDFs (local only)", () => {
  const files = dir ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];
  const expectedPath = dir ? path.join(dir, "expected.json") : "";
  const expected = dir && fs.existsSync(expectedPath) ? JSON.parse(fs.readFileSync(expectedPath, "utf8")) : {};

  it.each(files)("%s", (file) => {
    const full = path.join(dir, file);
    const web = parseWith("web", full);
    const edge = parseWith("edge", full);
    console.log(`${file}: web ${web.length} rows, edge ${edge.length} rows${JSON.stringify(web) === JSON.stringify(edge) ? " (identical)" : " (DIFFERENT)"}`);
    if (file in expected) expect(web.length).toBe(expected[file]);
    else expect(web.length).toBeGreaterThan(0);
    expect(edge).toEqual(web);
  }, 60_000);
});
