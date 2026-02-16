import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP tool definition — Tool 型のエイリアス。
 * inputSchema は JSON Schema 形式の Record を想定。
 */
export type McpToolDefinition = Tool;

/**
 * MCP Server の共通ボイラープレートを吸収するベースクラス。
 *
 * サブクラスは `getTools()` と `handleToolCall()` のみ実装すればよい。
 * ListTools / CallTool ハンドラの登録と StdioServerTransport 接続を共通化。
 *
 * success/error パターンを使うサーバーは `formatResult()` をオーバーライドして
 * レスポンスのフォーマットをカスタマイズできる。
 */
export abstract class McpBaseServer {
  protected server: Server;

  constructor(name: string, version: string) {
    this.server = new Server(
      { name, version },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers();
  }

  /**
   * サブクラスで提供するツール一覧を返す。
   */
  protected abstract getTools(): McpToolDefinition[];

  /**
   * ツール名と引数を受け取り、結果を返す。
   * サブクラスで switch 文等で各ツールのロジックを実装する。
   */
  protected abstract handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;

  /**
   * handleToolCall の戻り値を MCP レスポンスにフォーマットする。
   * デフォルトは JSON.stringify で text content を返す。
   *
   * success/error パターンを使うサーバーはこのメソッドをオーバーライドして
   * `{ success: true, data }` / `{ success: false, error }` を適切に変換できる。
   */
  protected formatResult(result: unknown): CallToolResult {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * ListTools / CallTool の共通ハンドラを登録。
   */
  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const result = await this.handleToolCall(
        name,
        (args ?? {}) as Record<string, unknown>,
      );

      return this.formatResult(result);
    });
  }

  /**
   * StdioServerTransport で MCP Server を起動する。
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
