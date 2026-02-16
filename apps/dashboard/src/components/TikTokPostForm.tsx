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

export default function TikTokPostForm() {
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");
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

      {/* More sections will be added in Tasks 7-9 */}
    </div>
  );
}
