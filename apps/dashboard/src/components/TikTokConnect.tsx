"use client";

import { useState } from "react";

export default function TikTokConnect() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tiktok/auth/url");
      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error || "Failed to get authorization URL");
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl font-bold text-slate-600">T</span>
      </div>
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        Connect your TikTok account
      </h2>
      <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
        Link your TikTok account to publish videos directly from the dashboard.
        You will be redirected to TikTok to authorize access.
      </p>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-blue-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Connecting...
          </>
        ) : (
          "Connect TikTok Account"
        )}
      </button>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
