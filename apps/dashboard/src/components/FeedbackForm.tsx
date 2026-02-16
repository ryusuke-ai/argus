"use client";

import { useState } from "react";

interface Props {
  sessionId: string;
}

export default function FeedbackForm({ sessionId }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    setResponse(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      setResponse(data.message || "No response");
      setMessage("");
    } catch {
      setResponse("Error sending feedback");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="text-2xl font-bold mb-4">Send Feedback</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Send a message to this session..."
          aria-label="フィードバックメッセージ"
          className="w-full p-3 border rounded-lg resize-y min-h-[100px]"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
      {response && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border-l-4 border-gray-500">
          <p className="font-semibold mb-2">Response:</p>
          <div className="whitespace-pre-wrap">{response}</div>
        </div>
      )}
    </div>
  );
}
