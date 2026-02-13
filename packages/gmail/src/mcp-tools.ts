import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Get MCP tool definitions for Gmail operations.
 */
export function getGmailTools(): Tool[] {
  return [
    {
      name: "compose_email",
      description:
        "新規メールのドラフトを作成します。送信はユーザーがSlackのボタンで確認後に行われます。メールアドレスが不明な場合はユーザーに確認してください。",
      inputSchema: {
        type: "object" as const,
        properties: {
          to: {
            type: "string",
            description: "宛先メールアドレス",
          },
          subject: {
            type: "string",
            description: "件名",
          },
          body: {
            type: "string",
            description: "本文",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "send_email",
      description:
        "メールを即座に送信します。確認ボタンなしで直接送信されるため、インボックスなど明示的な指示がある場合に使用してください。",
      inputSchema: {
        type: "object" as const,
        properties: {
          to: {
            type: "string",
            description: "宛先メールアドレス",
          },
          subject: {
            type: "string",
            description: "件名",
          },
          body: {
            type: "string",
            description: "本文",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  ];
}
