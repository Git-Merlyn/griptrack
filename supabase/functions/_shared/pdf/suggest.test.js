// @vitest-environment node
// "Set up this layout for me" (WP26 Phase 4): prompt text, mapping the
// model's answer to teach choices, and refusing answers outside the PDF.
import { describe, it, expect } from "vitest";
import { checkChoice, choiceFromSuggestion, promptLines, SUGGESTION_SCHEMA } from "./suggest.js";
import { columnList } from "./__fixtures__/synthetic.js";

const answer = (over = {}) => ({
  header_line: 2,
  name_heading: "Item Description",
  quantity_heading: "Qty",
  category_source: "column",
  category_heading: "Category",
  code_heading: "",
  skip_lines: [8],
  end_line: -1,
  ...over,
});

describe("promptLines", () => {
  it("numbers page 1 lines with x positions and adds page 2 for context", () => {
    const text = promptLines(columnList);
    expect(text).toContain("2: [x=40] Item  [x=66] Description  [x=300] Category  [x=480] Qty");
    expect(text).toContain("PAGE 2 (context only");
    expect(text).toContain("[x=40] Furniture Pad");
  });
});

describe("SUGGESTION_SCHEMA", () => {
  it("is strict: every property required, nothing extra", () => {
    expect(SUGGESTION_SCHEMA.additionalProperties).toBe(false);
    expect([...SUGGESTION_SCHEMA.required].sort()).toEqual(Object.keys(SUGGESTION_SCHEMA.properties).sort());
  });
});

describe("choiceFromSuggestion", () => {
  it("maps heading labels to columns (case-insensitive) and keeps lines below the headings", () => {
    const { choice } = choiceFromSuggestion(columnList, answer({ name_heading: "item description", skip_lines: [8, 8, 1] }));
    expect(choice).toEqual({
      headerIndex: 2,
      nameColumn: 0,
      quantityColumn: 2,
      categoryColumn: 1,
      codeColumn: -1,
      categoryFrom: "column",
      endIndex: -1,
      skipIndexes: [8],
    });
  });

  it("refuses a heading that is not on the headings line", () => {
    expect(choiceFromSuggestion(columnList, answer({ quantity_heading: "Amount" }))).toEqual({
      error: "The suggested columns are not on the headings line.",
    });
  });

  it("refuses a line number outside page 1", () => {
    expect(choiceFromSuggestion(columnList, answer({ header_line: 99 })).error).toBe("No column headings line was found.");
    expect(choiceFromSuggestion(columnList, answer({ header_line: -1 })).error).toBe("No column headings line was found.");
  });

  it("drops skip and end lines that are not below the headings", () => {
    const { choice } = choiceFromSuggestion(columnList, answer({ skip_lines: [0, 500], end_line: 1 }));
    expect(choice.skipIndexes).toEqual([]);
    expect(choice.endIndex).toBe(-1);
  });
});

describe("checkChoice", () => {
  it("accepts a layout that reads the items", () => {
    const { choice } = choiceFromSuggestion(columnList, answer());
    expect(checkChoice(columnList, choice)).toEqual({ ok: true, rows: 4 });
  });

  it("refuses a layout that reads too few items", () => {
    const { choice } = choiceFromSuggestion(columnList, answer({ quantity_heading: "Category", category_source: "none" }));
    expect(checkChoice(columnList, choice).ok).toBe(false);
  });
});
