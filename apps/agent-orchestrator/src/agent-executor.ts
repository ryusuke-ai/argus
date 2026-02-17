// Agent Executor - executes agents and records execution history
import {
  db,
  agents,
  agentExecutions,
  sessions,
  tasks,
  lessons,
} from "@argus/db";
import {
  query,
  extractText,
  scanOutputDir,
  findNewArtifacts,
  createDBObservationHooks,
  fireAndForget,
  type AgentResult,
  type ArgusHooks,
  type ObservationDB,
} from "@argus/agent-core";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notifySlack, uploadFileToSlack } from "./slack-notifier.js";
import { postOrUpdateExecutionLog } from "./slack-posts/execution-log.js";
import * as path from "node:path";
import { env } from "./env.js";

const agentConfigSchema = z
  .object({
    prompt: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    allowedSkills: z.array(z.string()).optional(),
    allowedCommands: z.array(z.string()).optional(),
  })
  .nullable();

/**
 * Create observation hooks that log tool executions to the tasks table.
 */
function createObservationHooks(dbSessionId: string): ArgusHooks {
  const obsDB = { db, tasks, lessons, eq } as ObservationDB;
  return createDBObservationHooks(obsDB, dbSessionId, "[Agent Executor]");
}

/** Errors matching these patterns are permanent (no point retrying). */
const PERMANENT_ERROR_PATTERNS = [
  "not found",
  "no prompt configured",
  "has no prompt",
];

function isRetryable(errorMessage: string): boolean {
  return !PERMANENT_ERROR_PATTERNS.some((p) =>
    errorMessage.toLowerCase().includes(p),
  );
}

/**
 * Execute an agent by ID (with automatic retry for transient errors).
 * Permanent errors (missing config, not found) are notified immediately.
 * Transient errors get one retry after 30s; Slack is notified only if retry also fails.
 */
export async function executeAgent(agentId: string): Promise<void> {
  const firstError = await executeAgentOnce(agentId);
  if (!firstError) return; // success

  if (!isRetryable(firstError)) {
    // Permanent error — notify immediately, no retry
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    const agentName = agent?.name ?? agentId;
    fireAndForget(
      notifySlack(
        `:x: *Agent execution failed*\n*Agent:* ${agentName}\n*Error:* ${firstError.slice(0, 300)}${firstError.length > 300 ? "..." : ""}`,
      ),
      "Slack notify permanent error",
    );
    return;
  }

  // Transient error — retry once
  const envDelay = env.AGENT_RETRY_DELAY_MS;
  const retryDelayMs = envDelay !== undefined ? Number(envDelay) : 30_000;
  console.log(`[Agent Executor] Retrying in ${retryDelayMs / 1000}s...`);
  await new Promise((r) => setTimeout(r, retryDelayMs));

  const retryError = await executeAgentOnce(agentId);
  if (!retryError) {
    console.log("[Agent Executor] Retry succeeded");
    return;
  }

  // Both attempts failed — notify Slack
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  const agentName = agent?.name ?? agentId;
  fireAndForget(
    notifySlack(
      `:x: *Agent execution failed (after retry)*\n*Agent:* ${agentName}\n*Error:* ${retryError.slice(0, 300)}${retryError.length > 300 ? "..." : ""}`,
    ),
    "Slack notify retry failure",
  );
}

/**
 * Single execution attempt. Returns null on success, error message on failure.
 */
async function executeAgentOnce(agentId: string): Promise<string | null> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    return `Agent not found: ${agentId}`;
  }

  const [execution] = await db
    .insert(agentExecutions)
    .values({ agentId, status: "running" })
    .returning();

  const startTime = Date.now();

  try {
    const configResult = agentConfigSchema.safeParse(agent.config);
    if (!configResult.success) {
      const errorMessage = `Agent ${agent.name} has invalid config: ${configResult.error.message}`;
      console.error(`[Agent Executor] ${errorMessage}`);
      await db
        .update(agentExecutions)
        .set({
          status: "error",
          errorMessage,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
        })
        .where(eq(agentExecutions.id, execution.id));
      return errorMessage;
    }
    const config = configResult.data;
    const prompt = config?.prompt;

    if (!prompt) {
      const errorMessage = `Agent ${agent.name} has no prompt configured`;
      console.error(`[Agent Executor] ${errorMessage}`);
      await db
        .update(agentExecutions)
        .set({
          status: "error",
          errorMessage,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
        })
        .where(eq(agentExecutions.id, execution.id));
      return errorMessage;
    }

    const [session] = await db
      .insert(sessions)
      .values({ sessionId: "" })
      .returning();
    const hooks = createObservationHooks(session.id);

    // 成果物スナップショット（実行前）
    const outputDir = path.resolve(process.cwd(), "../.claude/agent-output");
    const snapshotBefore = scanOutputDir(outputDir);

    const result: AgentResult = await query(prompt, {
      hooks,
      ...(config?.allowedTools ? { allowedTools: config.allowedTools } : {}),
      ...(config?.allowedSkills ? { allowedSkills: config.allowedSkills } : {}),
      ...(config?.allowedCommands
        ? { allowedCommands: config.allowedCommands }
        : {}),
    });

    if (result.sessionId) {
      await db
        .update(sessions)
        .set({ sessionId: result.sessionId })
        .where(eq(sessions.id, session.id));
    }

    if (!result.success) {
      const errorText = extractText(result.message.content);
      const errorMessage = errorText || "Agent execution failed";
      console.error(`[Agent Executor] ${errorMessage}`);
      await db
        .update(agentExecutions)
        .set({
          status: "error",
          errorMessage,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          sessionId: session.id,
        })
        .where(eq(agentExecutions.id, execution.id));

      // Update execution canvas (fire-and-forget)
      fireAndForget(
        postOrUpdateExecutionLog(),
        "execution log update on error",
      );

      return errorMessage;
    }

    await db
      .update(agentExecutions)
      .set({
        status: "success",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        output: JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
        sessionId: session.id,
      })
      .where(eq(agentExecutions.id, execution.id));

    console.log(`[Agent Executor] Success: ${agent.name}`);

    if (agent.type === "executor") {
      const resultText = extractText(result.message.content);

      if (resultText) {
        const notification = `*${agent.name}* completed:\n${resultText.slice(0, 500)}${resultText.length > 500 ? "..." : ""}`;
        await notifySlack(notification);
      }
    }

    // 成果物のSlackアップロード
    const snapshotAfter = scanOutputDir(outputDir);
    const newArtifacts = findNewArtifacts(snapshotBefore, snapshotAfter);
    if (newArtifacts.length > 0) {
      const NOTIFICATION_CHANNEL = env.SLACK_NOTIFICATION_CHANNEL;
      if (NOTIFICATION_CHANNEL) {
        console.log(
          `[Agent Executor] Uploading ${newArtifacts.length} artifact(s) to Slack`,
        );
        for (const artifact of newArtifacts) {
          await uploadFileToSlack(artifact, NOTIFICATION_CHANNEL);
        }
      }
    }

    // Update execution canvas (fire-and-forget)
    fireAndForget(
      postOrUpdateExecutionLog(),
      "execution log update on success",
    );

    return null; // success
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    try {
      await db
        .update(agentExecutions)
        .set({
          status: "error",
          errorMessage,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
        })
        .where(eq(agentExecutions.id, execution.id));
    } catch (updateError) {
      console.error(
        "[Agent Executor] Failed to update execution status to error:",
        updateError,
      );
    }

    console.error(`[Agent Executor] Error: ${errorMessage}`);

    // Update execution canvas (fire-and-forget)
    fireAndForget(postOrUpdateExecutionLog(), "execution log update on catch");

    return errorMessage;
  }
}
