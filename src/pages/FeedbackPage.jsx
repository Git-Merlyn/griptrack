import FeedbackForm from "../components/Feedback/FeedbackForm";

export default function FeedbackPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-accent">Beta Feedback</h1>
      <p className="text-text/70 mt-2">Report bugs or request features.</p>

      <div className="mt-6">
        <FeedbackForm />
      </div>
    </div>
  );
}
