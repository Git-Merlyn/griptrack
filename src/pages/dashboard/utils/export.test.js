import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  csvEscape,
  rowsToCsv,
  rowsToPrintHtml,
  openPrintWindow,
} from "./export";

describe("export.js", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("csvEscape returns empty for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("csvEscape quotes values with commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
    expect(csvEscape("plain")).toBe("plain");
  });

  it("rowsToCsv includes UTF-8 BOM and correct header order (includes Item ID)", () => {
    const csv = rowsToCsv([]);

    // BOM
    expect(csv.startsWith("\uFEFF")).toBe(true);

    const firstLine = csv.replace("\uFEFF", "").split("\n")[0];
    expect(firstLine).toBe(
      [
        "Item ID",
        "Name",
        "Category",
        "Source",
        "Location",
        "Status",
        "Quantity",
        "Reserve Min",
        "Start Date",
        "End Date",
        "Updated By",
      ].join(","),
    );
  });

  it("rowsToCsv exports numeric fields as numbers and defaults missing to 0", () => {
    const csv = rowsToCsv([
      { itemId: "A1", name: "Thing", quantity: "7", reserveMin: null },
      { itemId: "A2", name: "Thing2" }, // missing quantity/reserveMin
    ]);

    const lines = csv.replace("\uFEFF", "").split("\n");
    expect(lines).toHaveLength(1 + 2); // header + 2 rows

    // row1: quantity 7, reserveMin 0
    expect(lines[1].split(",")[6]).toBe("7");
    expect(lines[1].split(",")[7]).toBe("0");

    // row2: quantity 0, reserveMin 0
    expect(lines[2].split(",")[6]).toBe("0");
    expect(lines[2].split(",")[7]).toBe("0");
  });

  it("rowsToCsv escapes commas/quotes/newlines in cell values", () => {
    const csv = rowsToCsv([
      {
        itemId: 'ID"1',
        name: "Line,One",
        category: "Cat\nTwo",
        source: "Dean",
        location: "Truck 1",
        status: "Available",
        quantity: 1,
        reserveMin: 0,
        rentalStart: "2026-02-01",
        rentalEnd: "2026-02-10",
        updatedBy: "me",
      },
    ]);

    const content = csv.replace("\uFEFF", "");

    // Expect quotes to be doubled and fields wrapped (do not split on \n since CSV fields can contain newlines)
    expect(content).toContain('"ID""1"');
    expect(content).toContain('"Line,One"');
    expect(content).toContain('"Cat\nTwo"');
  });

  it("rowsToPrintHtml escapes HTML (& < >) and includes row count", () => {
    const html = rowsToPrintHtml(
      [
        {
          itemId: "<ID&1>",
          name: "Name & Stuff",
          category: "Cat",
          source: "Dean",
          location: "Truck",
          status: "Available",
          quantity: 1,
          reserveMin: 0,
          rentalStart: "2026-02-01",
          rentalEnd: "2026-02-10",
          updatedBy: "me",
        },
      ],
      "Export <Title>",
    );

    // title escaped
    expect(html).toContain("Export &lt;Title&gt;");

    // row count
    expect(html).toContain("— 1 item(s)");

    // cell values escaped
    expect(html).toContain("&lt;ID&amp;1&gt;");
    expect(html).toContain("Name &amp; Stuff");
  });

  it("openPrintWindow returns false and calls onBlocked if popup blocked", () => {
    const onBlocked = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(null);

    const ok = openPrintWindow("<html></html>", { onBlocked });

    expect(ok).toBe(false);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("openPrintWindow writes HTML to new window document", () => {
    const doc = {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    };
    const w = { document: doc };

    vi.spyOn(window, "open").mockReturnValue(w);

    const ok = openPrintWindow("<html>hi</html>");

    expect(ok).toBe(true);
    expect(doc.open).toHaveBeenCalled();
    expect(doc.write).toHaveBeenCalledWith("<html>hi</html>");
    expect(doc.close).toHaveBeenCalled();
  });
});
