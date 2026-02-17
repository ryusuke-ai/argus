import { NextRequest, NextResponse } from "next/server";
import { db } from "@argus/db/client";
import { sessions, messages } from "@argus/db/schema";
import { eq } from "drizzle-orm";
import { resume, extractText } from "@argus/agent-core";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  let feedbackText: string;
  try {
    const body = await req.json();
    feedbackText = body.message;
  } catch (error) {
    console.error("[Feedback]", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!feedbackText || typeof feedbackText !== "string") {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  try {
    // Fetch session
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (!session.sessionId) {
      return NextResponse.json(
        { error: "Session has no active Claude session" },
        { status: 400 },
      );
    }

    // Resume the session
    const result = await resume(session.sessionId, feedbackText);

    // Save messages
    await db
      .insert(messages)
      .values({ sessionId: id, content: feedbackText, role: "user" });

    const assistantText = extractText(result.message.content);

    if (assistantText) {
      await db
        .insert(messages)
        .values({ sessionId: id, content: assistantText, role: "assistant" });
    }

    return NextResponse.json({
      success: result.success,
      message: assistantText,
    });
  } catch (error) {
    console.error("[Feedback]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
