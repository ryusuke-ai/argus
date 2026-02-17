import { NextRequest, NextResponse } from "next/server";
import { query, extractText } from "@argus/agent-core";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Call Agent Core
    const result = await query(message);

    return NextResponse.json({
      success: result.success,
      sessionId: result.sessionId,
      content: extractText(result.message.content),
      cost: result.message.total_cost_usd,
    });
  } catch (error) {
    console.error("Query API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
