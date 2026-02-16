import { NextRequest, NextResponse } from "next/server";
import { refreshTokenIfNeeded } from "@argus/tiktok";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";

interface PublishStatusApiResponse {
  data?: {
    status: string;
    publish_id?: string;
    fail_reason?: string;
    publicaly_available_post_id?: number[];
  };
  error: { code: string; message: string };
}

interface RouteParams {
  params: Promise<{ publishId: string }>;
}

/**
 * GET /api/tiktok/status/:publishId
 * TikTok 投稿のステータスを1回チェックする（ポーリングはクライアント側で行う）
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { publishId } = await params;

    if (!publishId) {
      return NextResponse.json(
        { success: false, error: "publishId is required" },
        { status: 400 },
      );
    }

    // 1. トークンのリフレッシュ
    const authResult = await refreshTokenIfNeeded();
    if (!authResult.success || !authResult.tokens) {
      return NextResponse.json(
        { success: false, error: authResult.error || "Authentication failed" },
        { status: 401 },
      );
    }

    // 2. ステータスを1回だけチェック（ポーリングしない）
    const response = await fetch(
      `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authResult.tokens.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
    );

    const data = (await response.json()) as PublishStatusApiResponse;

    if (data.error.code !== "ok") {
      return NextResponse.json(
        {
          success: false,
          error: data.error.message || `Status error: ${data.error.code}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      status: data.data?.status || "unknown",
      publishId: data.data?.publish_id || publishId,
      failReason: data.data?.fail_reason || undefined,
      publicPostId: data.data?.publicaly_available_post_id || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Status API error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
