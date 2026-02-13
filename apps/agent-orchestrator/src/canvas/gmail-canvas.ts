/**
 * Gmail Canvas - Visualizes email inbox status in a Slack Canvas.
 * Uses @argus/slack-canvas for Canvas CRUD and @argus/db for email data.
 */

import { db, gmailMessages } from "@argus/db";
import type { GmailMessageRecord } from "@argus/db";
import { eq } from "drizzle-orm";
import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

const FEATURE_NAME = "gmail";

/**
 * Truncate a string to maxLen characters, appending "..." if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/**
 * Build Canvas-compatible markdown from Gmail message records.
 * Groups emails by classification (needs_reply, needs_attention).
 */
export function buildGmailCanvasMarkdown(emails: GmailMessageRecord[]): string {
  const lines: string[] = [];

  // Header
  const now = new Date();
  const timestamp = now.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  lines.push("# \u2709\uFE0F \u30E1\u30FC\u30EB\u53D7\u4FE1\u7BB1");
  lines.push(`\u6700\u7D42\u30C1\u30A7\u30C3\u30AF: ${timestamp}`);

  // Filter actionable emails
  const needsReply = emails.filter((e) => e.classification === "needs_reply");
  const needsAttention = emails.filter(
    (e) => e.classification === "needs_attention",
  );

  // Empty state
  if (needsReply.length === 0 && needsAttention.length === 0) {
    lines.push("");
    lines.push(
      "\u672A\u5BFE\u5FDC\u30E1\u30FC\u30EB\u306F\u3042\u308A\u307E\u305B\u3093",
    );
    return lines.join("\n");
  }

  // Needs reply section
  if (needsReply.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push(`## \u8981\u8FD4\u4FE1 (${needsReply.length}\u4EF6)`);
    for (const email of needsReply) {
      const sender = truncate(email.fromAddress, 30);
      const subject = truncate(email.subject, 50);
      const line = `- [ ] **${subject}** \u2014 _${sender}_`;
      lines.push(line);
      if (email.draftReply) {
        const reply = truncate(email.draftReply, 50);
        lines.push(`  > \u8FD4\u4FE1\u6848: ${reply}`);
      }
    }
  }

  // Needs attention section
  if (needsAttention.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push(`## \u8981\u78BA\u8A8D (${needsAttention.length}\u4EF6)`);
    for (const email of needsAttention) {
      const sender = truncate(email.fromAddress, 30);
      const subject = truncate(email.subject, 50);
      lines.push(`- [ ] **${subject}** \u2014 _${sender}_`);
    }
  }

  return lines.join("\n");
}

/**
 * Fetch pending Gmail messages from DB, build markdown, and update Canvas.
 */
export async function updateGmailCanvas(): Promise<void> {
  const channel = process.env.GMAIL_SLACK_CHANNEL;
  if (!channel) {
    console.log(
      "[Gmail Canvas] GMAIL_SLACK_CHANNEL not set. Skipping canvas update.",
    );
    return;
  }

  try {
    // Fetch pending emails (needs_reply or needs_attention, status=pending)
    const pendingEmails = await db
      .select()
      .from(gmailMessages)
      .where(eq(gmailMessages.status, "pending"));

    // Filter to only actionable emails
    const actionableEmails = pendingEmails.filter(
      (e) =>
        e.classification === "needs_reply" ||
        e.classification === "needs_attention",
    );

    // Build markdown
    const markdown = buildGmailCanvasMarkdown(actionableEmails);
    const title = "\u2709\uFE0F \u30E1\u30FC\u30EB\u53D7\u4FE1\u7BB1";

    // Upsert canvas
    const existingCanvasId = await findCanvasId(FEATURE_NAME);
    const result = await upsertCanvas(
      channel,
      title,
      markdown,
      existingCanvasId,
    );

    if (result.success && result.canvasId) {
      await saveCanvasId(FEATURE_NAME, result.canvasId, channel);
      console.log(`[Gmail Canvas] Canvas updated (id: ${result.canvasId})`);
    } else {
      console.error("[Gmail Canvas] Failed to update canvas:", result.error);
    }
  } catch (error) {
    console.error("[Gmail Canvas] Error updating canvas:", error);
  }
}
