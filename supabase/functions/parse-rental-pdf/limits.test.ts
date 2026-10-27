// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertHasText,
  classifyPdfError,
  compactPages,
  NO_TEXT_CODE,
  NO_TEXT_MESSAGE,
  decodePdfBase64,
  MAX_BODY_CHARS,
  MAX_PDF_BYTES,
  parseRequestBody,
  PdfRequestError,
} from "./limits.ts";

const b64 = (s: string) => Buffer.from(s, "latin1").toString("base64");

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return (e as PdfRequestError).status;
  }
  return undefined;
}

describe("parseRequestBody", () => {
  it("returns fileBase64 and fileName, response version 1 by default", () => {
    expect(parseRequestBody('{"fileBase64":"QQ==","fileName":"a.pdf"}')).toEqual({
      fileBase64: "QQ==",
      fileName: "a.pdf",
      version: 1,
      withPages: false,
    });
  });
  it("asks for the { items, layout } response only with v: 2 (WP26)", () => {
    expect(parseRequestBody('{"fileBase64":"QQ==","v":2}').version).toBe(2);
    expect(parseRequestBody('{"fileBase64":"QQ==","v":"2"}').version).toBe(1);
  });
  it("defaults a missing fileName to empty string", () => {
    expect(parseRequestBody('{"fileBase64":"QQ=="}').fileName).toBe("");
  });
  it("400 on bad JSON, non-object, missing or non-string fileBase64", () => {
    expect(statusOf(() => parseRequestBody("{not json"))).toBe(400);
    expect(statusOf(() => parseRequestBody("[1]"))).toBe(400);
    expect(statusOf(() => parseRequestBody("null"))).toBe(400);
    expect(statusOf(() => parseRequestBody("{}"))).toBe(400);
    expect(statusOf(() => parseRequestBody('{"fileBase64":42}'))).toBe(400);
  });
  it("keeps the old message for a missing fileBase64", () => {
    expect(() => parseRequestBody("{}")).toThrow("fileBase64 is required");
  });
  it("413 when the body is over MAX_BODY_CHARS", () => {
    expect(statusOf(() => parseRequestBody("x".repeat(MAX_BODY_CHARS + 1)))).toBe(413);
  });
});

describe("decodePdfBase64", () => {
  it("decodes a PDF and keeps every byte", () => {
    const src = "%PDF-1.7\nâãÏÓ body";
    const bytes = decodePdfBase64(b64(src));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString("latin1")).toBe(src);
  });
  it("accepts leading junk before %PDF- and ignores whitespace in the base64", () => {
    const enc = b64("junk\n%PDF-1.4\n");
    expect(decodePdfBase64(enc.slice(0, 4) + "\n" + enc.slice(4)).length).toBe(14);
  });
  it("400 on invalid base64", () => {
    expect(statusOf(() => decodePdfBase64("@@@@"))).toBe(400);
  });
  it("415 when there is no %PDF- signature", () => {
    expect(statusOf(() => decodePdfBase64(b64("hello, not a pdf")))).toBe(415);
  });
  it("413 over MAX_PDF_BYTES, checked before decoding", () => {
    const tooBig = "A".repeat(Math.ceil(((MAX_PDF_BYTES + 16) * 4) / 3));
    expect(statusOf(() => decodePdfBase64(tooBig))).toBe(413);
  });
  it("accepts exactly MAX_PDF_BYTES", () => {
    const head = "%PDF-1.7\n";
    const exact = Buffer.concat([Buffer.from(head), Buffer.alloc(MAX_PDF_BYTES - head.length, 0x30)]);
    expect(decodePdfBase64(exact.toString("base64")).length).toBe(MAX_PDF_BYTES);
  });
});

describe("classifyPdfError", () => {
  const named = (name: string) => Object.assign(new Error("internal detail"), { name });
  it("passes PdfRequestError through", () => {
    expect(classifyPdfError(new PdfRequestError(413, "too big"))).toEqual({ status: 413, error: "too big" });
  });
  it("422 for password-protected PDFs", () => {
    expect(classifyPdfError(named("PasswordException")).status).toBe(422);
  });
  it("422 for damaged PDFs", () => {
    for (const n of ["InvalidPDFException", "FormatError", "XRefParseException", "ParserEOFException"]) {
      expect(classifyPdfError(named(n)).status).toBe(422);
    }
  });
  it("500 with a generic message for anything else (no internal text)", () => {
    const r = classifyPdfError(new Error("internal detail"));
    expect(r.status).toBe(500);
    expect(r.error).not.toContain("internal detail");
    expect(classifyPdfError("weird").status).toBe(500);
    expect(classifyPdfError(null).status).toBe(500);
  });
});

describe("assertHasText (WP26 Phase 1)", () => {
  it("rejects a scan with no text as 422 pdf_no_text", () => {
    let err: unknown;
    try {
      assertHasText("\n\n  \n");
    } catch (e) {
      err = e;
    }
    expect(classifyPdfError(err)).toEqual({ status: 422, error: NO_TEXT_MESSAGE, code: NO_TEXT_CODE });
  });

  it("treats a stray page number as no text", () => {
    expect(() => assertHasText("1\n2\n")).toThrow(NO_TEXT_MESSAGE);
  });

  it("accepts a PDF with real text", () => {
    expect(() => assertHasText("RENTAL ORDER\n2 Baby Stand\n4 Apple Box\n")).not.toThrow();
  });

  it("other request errors carry no code", () => {
    expect(classifyPdfError(new PdfRequestError(413, "too big"))).toEqual({ status: 413, error: "too big" });
  });
});

describe("teach-it pages (WP26 Phase 3b)", () => {
  it("are returned only with v: 2 and pages: true", () => {
    expect(parseRequestBody('{"fileBase64":"QQ==","v":2,"pages":true}').withPages).toBe(true);
    expect(parseRequestBody('{"fileBase64":"QQ==","pages":true}').withPages).toBe(false);
    expect(parseRequestBody('{"fileBase64":"QQ==","v":2}').withPages).toBe(false);
  });

  it("keep the first 3 pages, drop empty items and round positions", () => {
    const page = [
      { str: "Qty", transform: [10, 0, 0, 10, 480.123, 700.987], width: 18.04 },
      { str: "  ", transform: [1, 0, 0, 1, 1, 1], width: 1 },
    ];
    const out = compactPages([page, page, page, page]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual([{ str: "Qty", transform: [1, 0, 0, 1, 480.1, 701], width: 18 }]);
  });
});
