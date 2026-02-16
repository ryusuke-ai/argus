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
  const [disclosureEnabled, setDisclosureEnabled] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [isAigc, setIsAigc] = useState(true); // Default ON for Argus (AI content platform)
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{
    state: "idle" | "publishing" | "polling" | "success" | "failed";
    message: string;
    publishId?: string;
  } | null>(null);
  const MAX_CAPTION_LENGTH = 2200;

  useEffect(() => {
    if (brandedContent && privacyLevel === "SELF_ONLY") {
      setPrivacyLevel("");
    }
  }, [brandedContent, privacyLevel]);

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

  const canPublish =
    videoUrl.trim() !== "" &&
    privacyLevel !== "" &&
    (!disclosureEnabled || yourBrand || brandedContent) &&
    !(brandedContent && privacyLevel === "SELF_ONLY") &&
    !publishing;

  async function handlePublish() {
    setPublishing(true);
    setPublishStatus({
      state: "publishing",
      message: "Your video is being processed. It may take a few minutes.",
    });

    try {
      const res = await fetch("/api/tiktok/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl,
          title: caption,
          privacyLevel,
          disableComment: !allowComment,
          disableDuet: !allowDuet,
          disableStitch: !allowStitch,
          brandContentToggle: brandedContent,
          brandOrganicToggle: yourBrand,
          isAigc,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPublishStatus({
          state: "success",
          message: "Video published successfully!",
          publishId: data.publishId,
        });
      } else {
        setPublishStatus({
          state: "failed",
          message: data.error || "Publishing failed",
        });
      }
    } catch (err) {
      setPublishStatus({
        state: "failed",
        message: err instanceof Error ? err.message : "Unexpected error",
      });
    } finally {
      setPublishing(false);
    }
  }

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
              <option
                key={option}
                value={option}
                disabled={option === "SELF_ONLY" && brandedContent}
              >
                {formatPrivacyLabel(option)}
                {option === "SELF_ONLY" && brandedContent
                  ? " (Not available for branded content)"
                  : ""}
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

      {/* Content Disclosure */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">
          Content Disclosure
        </h3>

        {/* Toggle */}
        <label className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Disclose video content</span>
          <button
            type="button"
            role="switch"
            aria-checked={disclosureEnabled}
            onClick={() => {
              setDisclosureEnabled(!disclosureEnabled);
              if (disclosureEnabled) {
                setYourBrand(false);
                setBrandedContent(false);
              }
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              disclosureEnabled ? "bg-blue-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                disclosureEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>

        {disclosureEnabled && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {/* Your Brand */}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={yourBrand}
                onChange={(e) => setYourBrand(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-slate-700">Your Brand</span>
                <p className="text-xs text-slate-500">
                  You are promoting yourself or your own business
                </p>
              </div>
            </label>

            {/* Branded Content */}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={brandedContent}
                onChange={(e) => setBrandedContent(e.target.checked)}
                disabled={privacyLevel === "SELF_ONLY"}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <div>
                <span
                  className={`text-sm ${privacyLevel === "SELF_ONLY" ? "text-slate-400" : "text-slate-700"}`}
                >
                  Branded Content
                </span>
                <p className="text-xs text-slate-500">
                  You are promoting another brand or a third party
                </p>
                {privacyLevel === "SELF_ONLY" && (
                  <p className="text-xs text-amber-600">
                    Change privacy level first. Branded content cannot be
                    private.
                  </p>
                )}
              </div>
            </label>

            {/* Label preview */}
            {(yourBrand || brandedContent) && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                {brandedContent
                  ? 'Your video will be labeled as "Paid partnership"'
                  : 'Your video will be labeled as "Promotional content"'}
              </p>
            )}

            {/* Warning when disclosure ON but nothing selected */}
            {!yourBrand && !brandedContent && (
              <p className="text-xs text-amber-600">
                You need to indicate if your content promotes yourself, a third
                party, or both.
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Generated Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">AI Disclosure</h3>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isAigc}
            onChange={(e) => setIsAigc(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-slate-700">
              This content is AI-generated
            </span>
            <p className="text-xs text-slate-500">
              Once set, this label cannot be removed from the post.
            </p>
          </div>
        </label>
      </div>

      {/* Consent */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <p className="text-xs text-slate-500">
          By posting, you agree to TikTok&apos;s{" "}
          {brandedContent && (
            <>
              <a
                href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Branded Content Policy
              </a>
              {" and "}
            </>
          )}
          <a
            href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Music Usage Confirmation
          </a>
          .
        </p>
      </div>

      {/* Status */}
      {publishStatus && (
        <div
          className={`bg-white border rounded-xl p-6 ${
            publishStatus.state === "success"
              ? "border-green-300 bg-green-50"
              : publishStatus.state === "failed"
                ? "border-red-300 bg-red-50"
                : "border-blue-300 bg-blue-50"
          }`}
        >
          <div className="flex items-center gap-3">
            {publishStatus.state === "polling" && (
              <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
            {publishStatus.state === "publishing" && (
              <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
            {publishStatus.state === "success" && (
              <span className="text-green-600 text-lg">{"\u2713"}</span>
            )}
            {publishStatus.state === "failed" && (
              <span className="text-red-600 text-lg">{"\u2717"}</span>
            )}
            <p
              className={`text-sm ${
                publishStatus.state === "success"
                  ? "text-green-700"
                  : publishStatus.state === "failed"
                    ? "text-red-700"
                    : "text-blue-700"
              }`}
            >
              {publishStatus.message}
            </p>
          </div>
        </div>
      )}

      {/* Publish Button */}
      <button
        onClick={handlePublish}
        disabled={!canPublish}
        className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {publishing ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Publishing...
          </>
        ) : (
          "Post to TikTok"
        )}
      </button>
    </div>
  );
}
