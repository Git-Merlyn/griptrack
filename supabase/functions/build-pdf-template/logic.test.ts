// @vitest-environment node
// build-pdf-template (WP26 Phase 4): body validation, and the Claude call
// with a fake client (no network, no key).
import { describe, it, expect, vi } from "vitest";
import { BuildError, MODEL, parsePagesBody, suggestLayout } from "./logic.ts";
import { columnList } from "../_shared/pdf/__fixtures__/synthetic.js";

const pages = columnList.map((p) => p.map((i) => ({ str: i.str, transform: i.transform, width: i.width })));

const goodAnswer = {
  header_line: 2,
  name_heading: "Item Description",
  quantity_heading: "Qty",
  category_source: "column",
  category_heading: "Category",
  code_heading: "",
  skip_lines: [8],
  end_line: -1,
};

function fakeClient(response: object) {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { create } } } as never, create };
}
const reply = (answer: unknown, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }],
});

async function status(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as BuildError).status;
  }
  return 200;
}

describe("parsePagesBody", () => {
  it("accepts 1 to 3 pages of text items", () => {
    expect(parsePagesBody(JSON.stringify({ pages }))).toHaveLength(2);
  });

  it.each([
    ["not JSON", "{"],
    ["no pages", JSON.stringify({})],
    ["too many pages", JSON.stringify({ pages: [[], [], [], []] })],
    ["a bad item", JSON.stringify({ pages: [[{ str: 1, transform: [1, 0, 0, 1, 0, 0], width: 1 }]] })],
    ["a bad transform", JSON.stringify({ pages: [[{ str: "a", transform: [1], width: 1 }]] })],
  ])("refuses %s", (_name, body) => {
    expect(() => parsePagesBody(body)).toThrow(BuildError);
  });
});

describe("suggestLayout", () => {
  it("asks for strict JSON with fallbacks, and returns the checked choice", async () => {
    const { client, create } = fakeClient(reply(goodAnswer));
    const result = await suggestLayout(client, pages);
    expect(result).toEqual({
      choice: expect.objectContaining({ headerIndex: 2, nameColumn: 0, quantityColumn: 2, categoryColumn: 1 }),
      rows: 4,
    });
    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: MODEL,
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(params.messages[0].content).toContain("2: [x=40] Item");
  });

  it("422 on a refusal, a cut-off answer, bad JSON, or an answer outside the PDF", async () => {
    expect(await status(suggestLayout(fakeClient(reply(goodAnswer, "refusal")).client, pages))).toBe(422);
    expect(await status(suggestLayout(fakeClient(reply(goodAnswer, "max_tokens")).client, pages))).toBe(422);
    expect(await status(suggestLayout(fakeClient(reply("not json")).client, pages))).toBe(422);
    expect(await status(suggestLayout(fakeClient(reply({ ...goodAnswer, quantity_heading: "Price" })).client, pages))).toBe(422);
  });
});
