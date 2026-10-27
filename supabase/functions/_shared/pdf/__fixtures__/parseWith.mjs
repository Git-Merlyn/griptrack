// Child-process helper for realDocs.test.js: parse one PDF with one pdf.js
// build and print the rows as JSON. Two pdf.js versions cannot share a
// process (they register one global worker), so each build runs separately.
//   node parseWith.mjs web|edge <file.pdf>
import fs from "node:fs";
import { parseRentalPages } from "../rows.js";

const [, , which, file] = process.argv;
const lib =
  which === "edge"
    ? await (await import("unpdf")).getResolvedPDFJS() // the edge function's build
    : await import("pdfjs-dist/legacy/build/pdf.mjs"); // the web's build
const task = lib.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true });
const doc = await task.promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  pages.push((await (await doc.getPage(i)).getTextContent()).items);
}
await task.destroy(); // the loading task's destroy exists in both builds
process.stdout.write(JSON.stringify(parseRentalPages(pages)));
