"use client";

import { useState, useEffect } from "react";

export interface CreatorInfo {
  creatorAvatarUrl: string;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

export interface PublishStatus {
  state: "idle" | "publishing" | "polling" | "success" | "failed";
  message: string;
  publishId?: string;
}

export const MAX_CAPTION_LENGTH = 2200;

export function formatPrivacyLabel(level: string): string {
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

export function useTikTokPost() {
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
  const [isAigc, setIsAigc] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(
    null,
  );

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

  function handleCaptionChange(value: string) {
    setCaption(value.slice(0, MAX_CAPTION_LENGTH));
  }

  function toggleDisclosure() {
    setDisclosureEnabled(!disclosureEnabled);
    if (disclosureEnabled) {
      setYourBrand(false);
      setBrandedContent(false);
    }
  }

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

  return {
    // Creator info
    creatorInfo,
    loading,
    error,

    // Form state
    videoUrl,
    setVideoUrl,
    caption,
    handleCaptionChange,
    privacyLevel,
    setPrivacyLevel,

    // Interactions
    allowComment,
    setAllowComment,
    allowDuet,
    setAllowDuet,
    allowStitch,
    setAllowStitch,

    // Disclosure
    disclosureEnabled,
    toggleDisclosure,
    yourBrand,
    setYourBrand,
    brandedContent,
    setBrandedContent,

    // AI
    isAigc,
    setIsAigc,

    // Publishing
    publishing,
    publishStatus,
    canPublish,
    handlePublish,
  };
}
