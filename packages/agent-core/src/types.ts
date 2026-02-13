// packages/agent-core/src/types.ts

export interface AgentResult {
  sessionId?: string;
  message: {
    type: "assistant";
    content: Block[];
    total_cost_usd: number;
  };
  toolCalls: ToolCall[];
  success: boolean;
}

export interface Block {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

export interface ToolCall {
  name: string;
  input: unknown;
  result?: unknown;
  duration_ms?: number;
  status: "success" | "error";
}

export interface QueryOptions {
  workingDir?: string;
  timeout?: number;
  model?: string;
  allowedTools?: string[];
  allowedCommands?: string[];
  allowedSkills?: string[];
}
