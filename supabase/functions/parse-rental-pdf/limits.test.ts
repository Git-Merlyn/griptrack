// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyPdfError,
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
  it("returns fileBase64 and fileName", () => {
    expect(parseRequestBody('{"fileBase64":"QQ==","fileName":"a.pdf"}')).toEqual({ fileBase64: "QQ==", fileName: "a.pdf" });
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
