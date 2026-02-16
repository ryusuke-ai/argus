import { NextResponse } from "next/server";
import {
  loadTokens,
  refreshTokenIfNeeded,
  queryCreatorInfo,
} from "@argus/tiktok";

/**
 * GET /api/tiktok/creator-info
 * TikTok クリエイター情報を取得する
 * トークンのリフレッシュも自動で行う
 */
export async function GET() {
  try {
    // 1. トークンの存在確認
    const stored = await loadTokens();
    if (!stored) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated. Please connect TikTok first.",
        },
        { status: 401 },
      );
    }

    // 2. トークンのリフレッシュ
    const authResult = await refreshTokenIfNeeded();
    if (!authResult.success || !authResult.tokens) {
      return NextResponse.json(
        { success: false, error: authResult.error || "Token refresh failed" },
        { status: 401 },
      );
    }

    // 3. クリエイター情報の取得
    const result = await queryCreatorInfo(authResult.tokens.accessToken);
    if (!result.success || !result.creatorInfo) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to fetch creator info",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      creatorInfo: result.creatorInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Creator info API error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
