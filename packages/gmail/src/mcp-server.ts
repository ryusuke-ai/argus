import { z } from "zod";
import { McpBaseServer, type McpToolDefinition } from "@argus/agent-core";
import { getGmailTools } from "./mcp-tools.js";
import { sendNewEmail } from "./gmail-client.js";
import { db, gmailOutgoing } from "@argus/db";

// ── Zod schemas ──────────────────────────────────────────────

const emailSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

// ── Server ───────────────────────────────────────────────────

export class GmailMcpServer extends McpBaseServer {
  private tools: McpToolDefinition[];

  constructor() {
    super("gmail-server", "0.1.0");
    this.tools = getGmailTools();
  }

  protected getTools(): McpToolDefinition[] {
    return this.tools;
  }

  protected async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "compose_email": {
        const { to, subject, body } = emailSchema.parse(args);

        // DB にドラフト保存
        const [draft] = await db
          .insert(gmailOutgoing)
          .values({ toAddress: to, subject, body, status: "draft" })
          .returning();

        return {
          draftId: draft!.id,
          to,
          subject,
          body,
          message: "ドラフトを作成しました。Slackに送信ボタンが表示されます。",
        };
      }
      case "send_email": {
        const { to, subject, body } = emailSchema.parse(args);

        const sendResult = await sendNewEmail(to, subject, body);
        if (!sendResult.success) {
          return { success: false, error: sendResult.error };
        }

        // DB に送信記録を保存
        await db.insert(gmailOutgoing).values({
          toAddress: to,
          subject,
          body,
          status: "sent",
          sentAt: new Date(),
        });

        return {
          to,
          subject,
          message: `メールを送信しました: ${subject} → ${to}`,
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  public override async start(): Promise<void> {
    await super.start();
    console.error("Gmail MCP Server started");
  }
}
