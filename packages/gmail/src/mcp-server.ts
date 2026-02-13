import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { getGmailTools } from "./mcp-tools.js";
import { sendNewEmail } from "./gmail-client.js";
import { db, gmailOutgoing } from "@argus/db";

export class GmailMcpServer {
  private server: Server;
  private tools: Tool[];

  constructor() {
    this.tools = getGmailTools();
    this.server = new Server(
      { name: "gmail-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers();
  }

  public getTools(): Tool[] {
    return this.tools;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await this.handleToolCall(
        name,
        (args ?? {}) as Record<string, unknown>,
      );
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    });
  }

  public async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "compose_email": {
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;

        // DB にドラフト保存
        const [draft] = await db
          .insert(gmailOutgoing)
          .values({ toAddress: to, subject, body, status: "draft" })
          .returning();

        return {
          draftId: draft.id,
          to,
          subject,
          body,
          message: "ドラフトを作成しました。Slackに送信ボタンが表示されます。",
        };
      }
      case "send_email": {
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;

        await sendNewEmail(to, subject, body);

        // DB に送信記録を保存
        await db
          .insert(gmailOutgoing)
          .values({ toAddress: to, subject, body, status: "sent", sentAt: new Date() });

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

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Gmail MCP Server started");
  }
}
