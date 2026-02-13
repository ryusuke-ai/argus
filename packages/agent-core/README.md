# @argus/agent-core

Claude Code CLIのラッパーライブラリ。query/resume/hooksを提供。

## インストール

```bash
pnpm add @argus/agent-core
```

## 使用方法

### Query実行

```typescript
import { query } from "@argus/agent-core";

const result = await query("Hello, what is 2+2?");
console.log(result.message.content);
console.log("Cost:", result.message.total_cost_usd);
```

### セッション継続

```typescript
import { resume } from "@argus/agent-core";

const result = await resume("session-id-here", "Continue the task");
console.log(result.success);
```

### 低レベルAPI

直接CLI実行が必要な場合:

```typescript
import { executeClaude } from "@argus/agent-core";

const result = await executeClaude({
  mode: "query",
  prompt: "What is the weather?",
  workingDir: "/path/to/project",
  timeout: 30000,
});

console.log(result.stdout);
console.log(result.success);
```

## API

### `query(prompt: string, options?: QueryOptions): Promise<AgentResult>`

新しいクエリを実行します。

**Parameters:**

- `prompt` - クエリ文字列
- `options` (optional)
  - `workingDir` - 作業ディレクトリ
  - `timeout` - タイムアウト（ミリ秒）

**Returns:** `AgentResult` - 実行結果

### `resume(sessionId: string, message: string): Promise<AgentResult>`

既存セッションを継続します。

**Parameters:**

- `sessionId` - セッションID
- `message` - 送信するメッセージ

**Returns:** `AgentResult` - 実行結果

### `executeClaude(options: ClaudeExecutionOptions): Promise<ClaudeExecutionResult>`

Claude CLIを直接実行します（低レベルAPI）。

**Parameters:**

- `options`
  - `mode` - "query" | "resume"
  - `prompt` - プロンプト文字列
  - `sessionId` - セッションID（resumeモード時）
  - `workingDir` - 作業ディレクトリ
  - `timeout` - タイムアウト（ミリ秒）

**Returns:** `ClaudeExecutionResult` - 実行結果

### `parseClaudeOutput(output: string): AgentResult`

Claude CLIのJSON出力をパースします。

**Parameters:**

- `output` - JSON文字列

**Returns:** `AgentResult` - パース済み結果

## 型定義

### `AgentResult`

```typescript
interface AgentResult {
  message: {
    type: "assistant";
    content: Block[];
    total_cost_usd: number;
  };
  toolCalls: ToolCall[];
  success: boolean;
}
```

### `Block`

```typescript
interface Block {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}
```

### `ToolCall`

```typescript
interface ToolCall {
  name: string;
  input: unknown;
  result?: unknown;
  duration_ms?: number;
  status: "success" | "error";
}
```

### `QueryOptions`

```typescript
interface QueryOptions {
  workingDir?: string;
  timeout?: number;
}
```

## テスト

```bash
pnpm test
```

## ビルド

```bash
pnpm build
```

## 環境変数

- `CLAUDE_CLI_PATH` - Claude CLIのパス（デフォルト: `~/.local/bin/claude`）

## ライセンス

MIT
