// supabase/functions/parse-rental-pdf/limits.ts
//
// Request limits and error mapping for parse-rental-pdf (audit L73).
// Pure TypeScript with no imports and no Deno globals, so the web vitest
// suite can test it (limits.test.ts). index.ts is the only runtime caller.

/** Largest PDF accepted, in decoded bytes. Mirrored in mobile/src/hooks/usePDFImport.ts. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Most pages parsed. Rental lists are 1-10 pages; 50 is generous. */
export const MAX_PAGES = 50;
/** Wall-clock budget for text extraction, checked between pages. */
export const PARSE_DEADLINE_MS = 25_000;
/** Largest request body: base64 of MAX_PDF_BYTES plus room for the JSON envelope and fileName. */
export const MAX_BODY_CHARS = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 64 * 1024;

/** A client-caused failure with the HTTP status to return. */
export class PdfRequestError extends Error {
  status: number;
  /** Machine-readable reason for the client (e.g. "pdf_no_text"). */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "PdfRequestError";
    this.status = status;
    this.code = code;
  }
}

export const TOO_LARGE_MESSAGE = "This PDF is too large. The limit is 10 MB.";
export const TOO_MANY_PAGES_MESSAGE = `This PDF has too many pages. The limit is ${MAX_PAGES}.`;
export const TOO_SLOW_MESSAGE = "This PDF took too long to read. Try a smaller file.";

// WP26 Phase 1: an image-only (scanned) PDF has no text layer. Same wording
// and threshold as the web (src/lib/importRows.js).
export const NO_TEXT_CODE = "pdf_no_text";
export const NO_TEXT_MESSAGE =
  "This PDF looks like a scan (images only), so there is no text to read. Ask the supplier for the original PDF, or add the items by hand.";
export const MIN_PDF_TEXT_CHARS = 20;

/** Throws PdfRequestError(422, pdf_no_text) when the extracted text is (almost) empty. */
export function assertHasText(fullText: string): void {
  if (fullText.replace(/\s+/g, "").length < MIN_PDF_TEXT_CHARS) {
    throw new PdfRequestError(422, NO_TEXT_MESSAGE, NO_TEXT_CODE);
  }
}

/** Parse the JSON body. Throws PdfRequestError(400/413). */
export function parseRequestBody(text: string): { fileBase64: string; fileName: string } {
  if (text.length > MAX_BODY_CHARS) throw new PdfRequestError(413, TOO_LARGE_MESSAGE);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new PdfRequestError(400, "Request body must be JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PdfRequestError(400, "Request body must be a JSON object.");
  }
  const { fileBase64, fileName } = body as Record<string, unknown>;
  if (typeof fileBase64 !== "string" || !fileBase64) {
    throw new PdfRequestError(400, "fileBase64 is required");
  }
  return { fileBase64, fileName: typeof fileName === "string" ? fileName : "" };
}

/** Decode base64 to bytes and check size and the %PDF- signature. Throws PdfRequestError(400/413/415). */
export function decodePdfBase64(fileBase64: string): Uint8Array {
  const clean = fileBase64.replace(/\s+/g, "");
  // 4 base64 chars carry 3 bytes; reject before allocating anything big.
  if (Math.floor((clean.length * 3) / 4) - 2 > MAX_PDF_BYTES) {
    throw new PdfRequestError(413, TOO_LARGE_MESSAGE);
  }
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new PdfRequestError(400, "fileBase64 is not valid base64.");
  }
  if (binary.length > MAX_PDF_BYTES) throw new PdfRequestError(413, TOO_LARGE_MESSAGE);
  // pdf.js tolerates junk before the header, so look in the first 1 KB.
  if (!binary.slice(0, 1024).includes("%PDF-")) {
    throw new PdfRequestError(415, "That file is not a PDF.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Map any error from parsing to { status, error }. pdf.js exceptions are
 * recognised by `name` (the bundle's classes are not exported as values).
 * 5xx bodies never echo internal messages.
 */
export function classifyPdfError(err: unknown): { status: number; error: string; code?: string } {
  if (err instanceof PdfRequestError) {
    return err.code
      ? { status: err.status, error: err.message, code: err.code }
      : { status: err.status, error: err.message };
  }
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "PasswordException") {
    return { status: 422, error: "This PDF is password-protected. Remove the password and try again." };
  }
  if (
    name === "InvalidPDFException" ||
    name === "FormatError" ||
    name === "XRefParseException" ||
    name === "ParserEOFException"
  ) {
    return { status: 422, error: "This PDF could not be read. It may be damaged." };
  }
  return { status: 500, error: "Could not parse this PDF. Please try again." };
}
