"use client";

import {
  useTikTokPost,
  formatPrivacyLabel,
  MAX_CAPTION_LENGTH,
} from "../hooks/use-tiktok-post";
import ContentDisclosureSection from "./ContentDisclosureSection";
import PublishStatusSection from "./PublishStatusSection";

export default function TikTokPostForm() {
  const {
    creatorInfo,
    loading,
    error,
    videoUrl,
    setVideoUrl,
    caption,
    handleCaptionChange,
    privacyLevel,
    setPrivacyLevel,
    allowComment,
    setAllowComment,
    allowDuet,
    setAllowDuet,
    allowStitch,
    setAllowStitch,
    disclosureEnabled,
    toggleDisclosure,
    yourBrand,
    setYourBrand,
    brandedContent,
    setBrandedContent,
    isAigc,
    setIsAigc,
    publishing,
    publishStatus,
    canPublish,
    handlePublish,
  } = useTikTokPost();

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
            onChange={(e) => handleCaptionChange(e.target.value)}
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
      <ContentDisclosureSection
        disclosureEnabled={disclosureEnabled}
        onToggleDisclosure={toggleDisclosure}
        yourBrand={yourBrand}
        onYourBrandChange={setYourBrand}
        brandedContent={brandedContent}
        onBrandedContentChange={setBrandedContent}
        privacyLevel={privacyLevel}
      />

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
      {publishStatus && <PublishStatusSection publishStatus={publishStatus} />}

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
