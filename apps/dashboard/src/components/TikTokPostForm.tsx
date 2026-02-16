"use client";

import { useState, useEffect } from "react";

interface CreatorInfo {
  creatorAvatarUrl: string;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

function formatPrivacyLabel(level: string): string {
  switch (level) {
    case "PUBLIC_TO_EVERYONE":
      return "Public";
    case "MUTUAL_FOLLOW_FRIENDS":
      return "Friends";
    case "FOLLOWER_OF_CREATOR":
      return "Followers";
    case "SELF_ONLY":
      return "Only me";
    default:
      return level;
  }
}

export default function TikTokPostForm() {
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const MAX_CAPTION_LENGTH = 2200;

  useEffect(() => {
    fetch("/api/tiktok/creator-info")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.creatorInfo) {
          setCreatorInfo(data.creatorInfo);
        } else {
          setError(data.error || "Failed to load creator info");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">
            Loading creator info...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Creator Info Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <img
            src={creatorInfo?.creatorAvatarUrl}
            alt={`${creatorInfo?.creatorNickname ?? "Creator"} avatar`}
            className="w-10 h-10 rounded-full"
          />
          <div>
            <p className="font-medium text-slate-900">
              {creatorInfo?.creatorNickname}
            </p>
            <p className="text-xs text-slate-500">
              @{creatorInfo?.creatorUsername}
            </p>
          </div>
        </div>
      </div>

      {/* Video URL + Preview */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Video</h3>
        <div>
          <label
            htmlFor="video-url"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Video URL
          </label>
          <input
            id="video-url"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://example.com/video.mp4"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            Publicly accessible video URL (e.g. Cloudflare R2)
          </p>
        </div>
        {videoUrl && (
          <div className="rounded-lg overflow-hidden bg-slate-50 border border-slate-200">
            <video
              src={videoUrl}
              controls
              className="w-full max-h-80 object-contain"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Caption</h3>
        <div>
          <label
            htmlFor="caption"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Title
          </label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) =>
              setCaption(e.target.value.slice(0, MAX_CAPTION_LENGTH))
            }
            placeholder="Enter a caption for your video..."
            rows={4}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
          <p className="mt-1 text-xs text-slate-400 text-right">
            {caption.length} / {MAX_CAPTION_LENGTH}
          </p>
        </div>
      </div>

      {/* Privacy Level */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Privacy</h3>
        <div>
          <label
            htmlFor="privacy-level"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Who can view this video
          </label>
          <select
            id="privacy-level"
            value={privacyLevel}
            onChange={(e) => setPrivacyLevel(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="" disabled>
              Select privacy level...
            </option>
            {creatorInfo?.privacyLevelOptions.map((option) => (
              <option key={option} value={option}>
                {formatPrivacyLabel(option)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interaction Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Interactions</h3>
        <div className="space-y-3">
          {/* Allow Comment */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowComment}
              onChange={(e) => setAllowComment(e.target.checked)}
              disabled={creatorInfo?.commentDisabled}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span
              className={`text-sm ${creatorInfo?.commentDisabled ? "text-slate-400" : "text-slate-700"}`}
            >
              Allow comments
              {creatorInfo?.commentDisabled && (
                <span className="ml-1 text-xs text-slate-400">
                  (Disabled by creator)
                </span>
              )}
            </span>
          </label>

          {/* Allow Duet */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowDuet}
              onChange={(e) => setAllowDuet(e.target.checked)}
              disabled={creatorInfo?.duetDisabled}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span
              className={`text-sm ${creatorInfo?.duetDisabled ? "text-slate-400" : "text-slate-700"}`}
            >
              Allow duets
              {creatorInfo?.duetDisabled && (
                <span className="ml-1 text-xs text-slate-400">
                  (Disabled by creator)
                </span>
              )}
            </span>
          </label>

          {/* Allow Stitch */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowStitch}
              onChange={(e) => setAllowStitch(e.target.checked)}
              disabled={creatorInfo?.stitchDisabled}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span
              className={`text-sm ${creatorInfo?.stitchDisabled ? "text-slate-400" : "text-slate-700"}`}
            >
              Allow stitches
              {creatorInfo?.stitchDisabled && (
                <span className="ml-1 text-xs text-slate-400">
                  (Disabled by creator)
                </span>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* More sections will be added in Tasks 8-9 */}
    </div>
  );
}
