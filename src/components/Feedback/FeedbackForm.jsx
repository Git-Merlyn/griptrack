import React, { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const FeedbackForm = ({ onSubmitted }) => {
  const table = import.meta.env.VITE_FEEDBACK_TABLE || "beta_feedback";

  const [type, setType] = useState("bug");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pageUrl = useMemo(() => {
    try {
      return window.location.href;
    } catch {
      return "";
    }
  }, []);

  const toastSuccess = (msg) => {
    if (window.toast?.success) return window.toast.success(msg);
    if (window.toast) return window.toast(msg);
    alert(msg);
  };

  const toastError = (msg) => {
    if (window.toast?.error) return window.toast.error(msg);
    if (window.toast) return window.toast(msg);
    alert(msg);
  };

  const reset = () => {
    setType("bug");
    setSeverity("medium");
    setTitle("");
    setDescription("");
    setSteps("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    try {
      const payload = {
        type,
        severity,
        title: title.trim() || null,
        description: description.trim(),
        steps: steps.trim() || null,
        page_url: pageUrl || null,
        user_agent: navigator?.userAgent || null,
      };

      const { error } = await supabase.from(table).insert([payload]);
      if (error) throw error;

      toastSuccess("Feedback submitted — thank you!");
      reset();
      onSubmitted?.();
    } catch (err) {
      console.error(err);
      toastError(err?.message || "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-sm text-gray-300">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
          >
            <option value="bug">Bug</option>
            <option value="feature">Feature request</option>
            <option value="question">Question</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-300">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm text-gray-300">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
          placeholder="Short summary"
        />
      </div>

      <div>
        <label className="text-sm text-gray-300">Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded bg-white text-black min-h-[110px]"
          placeholder="What happened / what do you want?"
          required
        />
      </div>

      <div>
        <label className="text-sm text-gray-300">
          Steps to reproduce (optional)
        </label>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded bg-white text-black min-h-[80px]"
          placeholder="1) … 2) … 3) …"
        />
      </div>

      <div className="text-xs text-gray-400">
        Page: <span className="text-gray-300">{pageUrl}</span>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <button type="button" onClick={reset} className="btn-secondary">
          Clear
        </button>
        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className={
            submitting || !description.trim() ? "btn-disabled" : "btn-accent"
          }
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
};

export default FeedbackForm;
export { FeedbackForm };
