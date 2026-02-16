// Message Handler - Model switch commands
// Handles model switching and status display commands.

import { getDefaultModel } from "@argus/agent-core";

/** Per-channel model override. If not set, uses getDefaultModel(). */
export const channelModelOverrides = new Map<string, string>();

export const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
  haiku: "claude-haiku-4-5-20251001",
};

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

/**
 * Check if the message is a model switch command.
 * Supported patterns:
 *   "Opusにして", "Sonnetにして", "Haikuにして"
 *   "opus", "sonnet", "haiku" (exact match, case-insensitive)
 *   "モデル" or "model" → show current model
 */
export function parseModelCommand(
  text: string,
): { action: "switch"; model: string } | { action: "status" } | null {
  const trimmed = text.trim().toLowerCase();

  // "〜にして" pattern
  const switchMatch = trimmed.match(/^(opus|sonnet|haiku)にして$/);
  if (switchMatch) {
    return { action: "switch", model: MODEL_ALIASES[switchMatch[1]] };
  }

  // Exact model name
  if (trimmed in MODEL_ALIASES) {
    return { action: "switch", model: MODEL_ALIASES[trimmed] };
  }

  // Status check
  if (trimmed === "モデル" || trimmed === "model") {
    return { action: "status" };
  }

  return null;
}

/**
 * Handle a model command: switch model or show status.
 * Returns true if the command was handled (caller should return early).
 */
export async function handleModelCommand(
  text: string,
  channel: string,
  threadTs: string,
  say: (msg: { text: string; thread_ts: string }) => Promise<unknown>,
): Promise<boolean> {
  const command = parseModelCommand(text);
  if (!command) return false;

  if (command.action === "switch") {
    channelModelOverrides.set(channel, command.model);
    const displayName = MODEL_DISPLAY_NAMES[command.model] || command.model;
    await say({
      text: `モデルを ${displayName} に切り替えました。`,
      thread_ts: threadTs,
    });
  } else {
    const override = channelModelOverrides.get(channel);
    const currentModel = override || getDefaultModel();
    const displayName = MODEL_DISPLAY_NAMES[currentModel] || currentModel;
    const source = override ? "手動設定" : "自動検出";
    await say({
      text: `現在のモデル: ${displayName} (${source})`,
      thread_ts: threadTs,
    });
  }
  return true;
}
