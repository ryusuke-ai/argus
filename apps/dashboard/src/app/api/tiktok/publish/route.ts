import { NextRequest, NextResponse } from "next/server";
import { directPostVideo } from "@argus/tiktok";
import type { DirectPostInput } from "@argus/tiktok";

/**
 * POST /api/tiktok/publish
 * TikTok に動画を投稿する（Direct Post）
 * body: DirectPostInput
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DirectPostInput;

    if (!body.videoUrl) {
      return NextResponse.json(
        { success: false, error: "videoUrl is required" },
        { status: 400 },
      );
    }

    if (!body.privacyLevel) {
      return NextResponse.json(
        { success: false, error: "privacyLevel is required" },
        { status: 400 },
      );
    }

    const result = await directPostVideo(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Publishing failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      publishId: result.publishId,
      privacyLevel: result.privacyLevel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Publish API error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
