"use client";

import type { PublishStatus } from "../hooks/use-tiktok-post";

interface PublishStatusSectionProps {
  publishStatus: PublishStatus;
}

export default function PublishStatusSection({
  publishStatus,
}: PublishStatusSectionProps) {
  const borderColor =
    publishStatus.state === "success"
      ? "border-green-300 bg-green-50"
      : publishStatus.state === "failed"
        ? "border-red-300 bg-red-50"
        : "border-blue-300 bg-blue-50";

  const textColor =
    publishStatus.state === "success"
      ? "text-green-700"
      : publishStatus.state === "failed"
        ? "text-red-700"
        : "text-blue-700";

  return (
    <div className={`bg-white border rounded-xl p-6 ${borderColor}`}>
      <div className="flex items-center gap-3">
        {(publishStatus.state === "polling" ||
          publishStatus.state === "publishing") && (
          <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        )}
        {publishStatus.state === "success" && (
          <span className="text-green-600 text-lg">{"\u2713"}</span>
        )}
        {publishStatus.state === "failed" && (
          <span className="text-red-600 text-lg">{"\u2717"}</span>
        )}
        <p className={`text-sm ${textColor}`}>{publishStatus.message}</p>
      </div>
    </div>
  );
}
