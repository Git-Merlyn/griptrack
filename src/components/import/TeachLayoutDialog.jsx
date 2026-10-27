// "Teach it" (WP26 Phase 3, TODO 9.21): the user shows GripTrack how one
// supplier's PDF is laid out, once. They pick the line with the column
// headings, say which heading is the name and the quantity (category and
// code optional), mark lines to skip and where the items end, and watch the
// rows update. Saving stores an org template that later imports of this
// supplier's PDFs use automatically (web and mobile).
import { useMemo, useState } from "react";
import DialogShell from "@/components/dialogs/DialogShell";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";
import { applyTemplate } from "@pdf/templates.js";
import {
  buildTemplate,
  defaultLayoutName,
  headingsFor,
  lineText,
  pageOneLines,
} from "@pdf/teach.js";

const MAX_LINES_SHOWN = 80;
const PREVIEW_ROWS = 10;

const MODES = [
  { key: "header", label: "Column headings" },
  { key: "skip", label: "Lines to skip" },
  { key: "end", label: "Where items end" },
];

const selectClass = "border px-2 py-1 w-full bg-background text-text border-text/15 rounded";

export default function TeachLayoutDialog({ isOpen, onClose, pages, existing, onSaved }) {
  const { orgId } = useUser();
  const lines = useMemo(() => pageOneLines(pages).slice(0, MAX_LINES_SHOWN), [pages]);

  const [mode, setMode] = useState("header");
  const [headerIndex, setHeaderIndex] = useState(-1);
  const [nameColumn, setNameColumn] = useState(-1);
  const [quantityColumn, setQuantityColumn] = useState(-1);
  const [categoryColumn, setCategoryColumn] = useState(-1);
  const [codeColumn, setCodeColumn] = useState(-1);
  const [categoryFrom, setCategoryFrom] = useState("none");
  const [endIndex, setEndIndex] = useState(-1);
  const [skipIndexes, setSkipIndexes] = useState([]);
  const [name, setName] = useState(existing?.name || defaultLayoutName(pages));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const headings = useMemo(() => headingsFor(pages, headerIndex), [pages, headerIndex]);

  const built = useMemo(
    () =>
      buildTemplate(pages, {
        headerIndex,
        nameColumn,
        quantityColumn,
        categoryColumn,
        codeColumn,
        categoryFrom,
        endIndex,
        skipIndexes,
      }),
    [pages, headerIndex, nameColumn, quantityColumn, categoryColumn, codeColumn, categoryFrom, endIndex, skipIndexes],
  );
  const preview = useMemo(
    () => (built.errors ? null : applyTemplate(built.template, pages)),
    [built, pages],
  );

  const pickLine = (i) => {
    setSaveError("");
    if (mode === "header") {
      setHeaderIndex(i);
      setNameColumn(-1);
      setQuantityColumn(-1);
      setCategoryColumn(-1);
      setCodeColumn(-1);
      setMode("skip");
    } else if (mode === "skip") {
      if (i <= headerIndex) return;
      setSkipIndexes((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
    } else if (i > headerIndex) {
      setEndIndex((prev) => (prev === i ? -1 : i));
    }
  };

  const save = async () => {
    if (built.errors || !preview?.rows.length) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError("Give this layout a name.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const query = existing?.id && existing.scope === "org"
      ? supabase.from("pdf_templates").update({ name: trimmed, template: built.template }).eq("id", existing.id)
      : supabase.from("pdf_templates").insert({ org_id: orgId, name: trimmed, template: built.template });
    const { data, error } = await query.select("id, name, scope, template, success_count").maybeSingle();
    setSaving(false);
    if (error || !data) {
      setSaveError(
        error?.code === "23505"
          ? "You already have a layout with this name. Choose another name."
          : error?.message || "Only owners, admins and department heads can save layouts.",
      );
      return;
    }
    onSaved?.(data);
  };

  const lineState = (i) => {
    if (i === headerIndex) return "header";
    if (i === endIndex) return "end";
    if (skipIndexes.includes(i)) return "skip";
    return "";
  };

  const instructions = {
    header: "Click the line with the column headings (for example: Description, Qty).",
    skip: "Click any line that is not an item (subtotals, page headers) to skip lines like it. Click again to undo.",
    end: "Click the first line after the items (for example: Total). Optional.",
  }[mode];

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      title="Teach GripTrack this supplier's layout"
      size="wide"
      closeOnOverlay={false}
    >
      <p className="text-sm text-gray-400 mb-3">
        Do this once per supplier. GripTrack remembers the layout and uses it for their next PDFs,
        on the web and in the app. Only the layout is saved, never the items.
      </p>

      <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="What to mark">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mode === m.key}
            disabled={m.key !== "header" && headerIndex < 0}
            onClick={() => setMode(m.key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              mode === m.key ? "border-accent bg-accent/15 text-heading" : "border-text/15 text-gray-400"
            } disabled:opacity-40`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-heading mb-2">{instructions}</p>

      <ol
        className="border border-text/15 rounded max-h-64 overflow-y-auto text-xs font-mono mb-4"
        aria-label="Page 1 of the PDF"
      >
        {lines.map((line, i) => {
          const state = lineState(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => pickLine(i)}
                data-testid={`teach-line-${i}`}
                className={`w-full text-left px-2 py-1 border-b border-text/5 hover:bg-accent/10 ${
                  state === "header"
                    ? "bg-accent/20 text-heading font-semibold"
                    : state === "skip"
                      ? "line-through text-gray-500"
                      : state === "end"
                        ? "bg-warning/15 text-heading"
                        : "text-text"
                }`}
              >
                {state && <span className="sr-only">{state}: </span>}
                {lineText(line)}
              </button>
            </li>
          );
        })}
      </ol>

      {headerIndex >= 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
          <ColumnSelect label="Item name column" value={nameColumn} onChange={setNameColumn} headings={headings} required />
          <ColumnSelect label="Quantity column" value={quantityColumn} onChange={setQuantityColumn} headings={headings} required />
          <ColumnSelect
            label="Category column"
            value={categoryColumn}
            onChange={(v) => {
              setCategoryColumn(v);
              setCategoryFrom(v >= 0 ? "column" : categoryFrom === "column" ? "none" : categoryFrom);
            }}
            headings={headings}
          />
          <ColumnSelect label="Item code column" value={codeColumn} onChange={setCodeColumn} headings={headings} />
          <label className="sm:col-span-2 flex items-center gap-2 text-gray-300">
            <input
              type="checkbox"
              checked={categoryFrom === "heading"}
              disabled={categoryColumn >= 0}
              onChange={(e) => setCategoryFrom(e.target.checked ? "heading" : "none")}
            />
            Lines without a quantity are section headings: use them as the category
          </label>
          <label className="sm:col-span-2 text-gray-300">
            Layout name
            <input
              className="border px-2 py-1 w-full mt-1 bg-background text-text border-text/15 rounded"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
      )}

      {preview && (
        <div className="mb-4" aria-live="polite">
          <p className={`text-sm mb-2 ${preview.drift ? "text-warning" : "text-heading"}`}>
            {preview.rows.length} item{preview.rows.length === 1 ? "" : "s"} found
            {preview.drift && preview.rows.length > 0
              ? `; ${preview.candidates - preview.rows.length} lines with a quantity could not be read. Check the columns.`
              : ""}
          </p>
          {preview.rows.length > 0 && (
            <table className="w-full text-xs border border-text/15" aria-label="Preview">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="p-1.5">Name</th>
                  <th className="p-1.5">Category</th>
                  <th className="p-1.5">Qty</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i} className="border-t border-text/10">
                    <td className="p-1.5">{r.name}</td>
                    <td className="p-1.5">{r.category || "-"}</td>
                    <td className="p-1.5">{r.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.rows.length > PREVIEW_ROWS && (
            <p className="text-xs text-gray-500 mt-1">and {preview.rows.length - PREVIEW_ROWS} more</p>
          )}
        </div>
      )}

      {saveError && <p className="text-danger text-sm mb-3" role="alert">{saveError}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={!preview?.rows.length || saving ? "btn-disabled" : "btn-accent"}
          disabled={!preview?.rows.length || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save layout"}
        </button>
      </div>
    </DialogShell>
  );
}

function ColumnSelect({ label, value, onChange, headings, required = false }) {
  return (
    <label className="text-gray-300">
      {label}
      {required ? "" : " (optional)"}
      <select
        className={`${selectClass} mt-1`}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      >
        <option value={-1}>{required ? "Choose…" : "None"}</option>
        {headings.map((h, i) => (
          <option key={i} value={i}>
            {h.label}
          </option>
        ))}
      </select>
    </label>
  );
}
