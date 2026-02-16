"use client";

import { useState } from "react";

export default function QueryForm() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResponse("");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to query agent");
        return;
      }

      setResponse(data.content);
      setMessage("");
    } catch (_err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="message"
            className="block text-sm font-medium text-slate-600 mb-2"
          >
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-3 min-h-[100px] text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your message..."
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Send"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-lg">
          {error}
        </div>
      )}

      {response && (
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <h3 className="font-semibold text-slate-700 mb-2">Response:</h3>
          <div className="whitespace-pre-wrap text-slate-600">{response}</div>
        </div>
      )}
    </div>
  );
}
