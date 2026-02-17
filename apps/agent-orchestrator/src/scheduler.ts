// Cron Scheduler - manages scheduled agent execution
import cron, { ScheduledTask } from "node-cron";
import { db, agents, type Agent } from "@argus/db";
import { eq } from "drizzle-orm";
import { executeAgent } from "./agent-executor.js";
import { checkGmail } from "./gmail-checker.js";
import { generateDailyPlan } from "./daily-planner/index.js";
import { runCodePatrol } from "./code-patrol/index.js";
import { runConsistencyCheck } from "./consistency-checker/index.js";
import { postDailyNews } from "./slack-posts/daily-news.js";
import { env } from "./env.js";

/**
 * AgentScheduler - manages cron-based scheduling for agents
 *
 * Responsibilities:
 * - Initialize from database on startup
 * - Validate and register cron schedules
 * - Dynamically add/remove agents at runtime
 * - Graceful shutdown
 */
export class AgentScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private gmailTask: ScheduledTask | null = null;
  private dailyPlanTask: ScheduledTask | null = null;
  private codePatrolTask: ScheduledTask | null = null;
  private consistencyCheckTask: ScheduledTask | null = null;
  private dailyNewsTask: ScheduledTask | null = null;

  /**
   * Initialize scheduler by loading all enabled agents from database
   */
  async initialize(): Promise<void> {
    console.log("[Scheduler] Initializing...");

    const enabledAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.enabled, true));

    console.log(`[Scheduler] Found ${enabledAgents.length} enabled agents`);

    for (const agent of enabledAgents) {
      this.scheduleAgent(agent);
    }

    this.scheduleGmailChecker();
    this.scheduleDailyPlanner();
    this.scheduleCodePatrol();
    this.scheduleConsistencyCheck();
    this.scheduleDailyNews();

    console.log("[Scheduler] Initialization complete");
  }

  /**
   * Schedule a single agent for cron execution
   * Validates cron expression and registers the task
   */
  private scheduleAgent(agent: Agent): void {
    if (!agent.schedule) {
      console.log(`[Scheduler] Skip ${agent.name}: no schedule`);
      return;
    }

    if (!cron.validate(agent.schedule)) {
      console.error(
        `[Scheduler] Invalid cron expression for ${agent.name}: ${agent.schedule}`,
      );
      return;
    }

    const task = cron.schedule(
      agent.schedule,
      async () => {
        console.log(`[Scheduler] Triggering agent: ${agent.name}`);
        try {
          await executeAgent(agent.id);
        } catch (error) {
          console.error(
            `[Scheduler] Error executing agent ${agent.name}:`,
            error,
          );
        }
      },
      { timezone: "Asia/Tokyo" },
    );

    this.tasks.set(agent.id, task);
    console.log(`[Scheduler] Scheduled: ${agent.name} (${agent.schedule})`);
  }

  /**
   * Schedule Gmail checker cron job (every 3 hours).
   * Only activates when GMAIL_ADDRESS environment variable is set.
   */
  private scheduleGmailChecker(): void {
    if (!env.GMAIL_ADDRESS) {
      console.log("[Scheduler] Gmail checker disabled: GMAIL_ADDRESS not set");
      return;
    }
    this.gmailTask = cron.schedule("0 */3 * * *", async () => {
      console.log("[Scheduler] Running Gmail check...");
      try {
        await checkGmail();
        console.log("[Scheduler] Gmail check complete");
      } catch (error) {
        console.error("[Scheduler] Gmail check error:", error);
      }
    });
    console.log("[Scheduler] Gmail checker scheduled (every 3 hours)");
  }

  /**
   * Schedule daily planner cron job (3:50 AM JST daily).
   * Only activates when DAILY_PLAN_CHANNEL environment variable is set.
   */
  private scheduleDailyPlanner(): void {
    if (!env.DAILY_PLAN_CHANNEL) {
      console.log(
        "[Scheduler] Daily planner disabled: DAILY_PLAN_CHANNEL not set",
      );
      return;
    }
    this.dailyPlanTask = cron.schedule(
      "50 3 * * *",
      async () => {
        console.log("[Scheduler] Running daily planner...");
        try {
          await generateDailyPlan();
          console.log("[Scheduler] Daily planner complete");
        } catch (error) {
          console.error("[Scheduler] Daily planner error:", error);
        }
      },
      { timezone: "Asia/Tokyo" },
    );
    console.log("[Scheduler] Daily planner scheduled (3:50 AM JST daily)");
  }

  /**
   * Schedule Code Patrol cron job (Saturday 3:00 AM JST).
   * Starts early so the report is ready by 4:00 AM (may take up to 45 min).
   * Only activates when CODE_PATROL_CHANNEL environment variable is set.
   */
  private scheduleCodePatrol(): void {
    if (!env.CODE_PATROL_CHANNEL) {
      console.log(
        "[Scheduler] Code Patrol disabled: CODE_PATROL_CHANNEL not set",
      );
      return;
    }
    this.codePatrolTask = cron.schedule(
      "0 3 * * 6",
      async () => {
        console.log("[Scheduler] Running Code Patrol...");
        try {
          await runCodePatrol();
          console.log("[Scheduler] Code Patrol complete");
        } catch (error) {
          console.error("[Scheduler] Code Patrol error:", error);
        }
      },
      { timezone: "Asia/Tokyo" },
    );
    console.log("[Scheduler] Code Patrol scheduled (Saturday 3:00 AM JST)");
  }

  /**
   * Schedule Consistency Check cron job (Saturday 3:50 AM JST).
   * Lightweight (~3 min), finishes well before 4:00 AM.
   * Only activates when CONSISTENCY_CHECK_CHANNEL environment variable is set.
   */
  private scheduleConsistencyCheck(): void {
    if (!env.CONSISTENCY_CHECK_CHANNEL) {
      console.log(
        "[Scheduler] Consistency Check disabled: CONSISTENCY_CHECK_CHANNEL not set",
      );
      return;
    }
    this.consistencyCheckTask = cron.schedule(
      "50 3 * * 6",
      async () => {
        console.log("[Scheduler] Running Consistency Check...");
        try {
          await runConsistencyCheck();
          console.log("[Scheduler] Consistency Check complete");
        } catch (error) {
          console.error("[Scheduler] Consistency Check error:", error);
        }
      },
      { timezone: "Asia/Tokyo" },
    );
    console.log(
      "[Scheduler] Consistency Check scheduled (Saturday 3:50 AM JST)",
    );
  }

  /**
   * Schedule Daily News post cron job (5:00 AM JST daily).
   * Only activates when DAILY_NEWS_CHANNEL or SLACK_NOTIFICATION_CHANNEL is set.
   */
  private scheduleDailyNews(): void {
    const channel = env.DAILY_NEWS_CHANNEL || env.SLACK_NOTIFICATION_CHANNEL;
    if (!channel) {
      console.log("[Scheduler] Daily News disabled: no channel configured");
      return;
    }
    this.dailyNewsTask = cron.schedule(
      "0 4 * * *",
      async () => {
        console.log("[Scheduler] Running Daily News post...");
        try {
          await postDailyNews();
          console.log("[Scheduler] Daily News post complete");
        } catch (error) {
          console.error("[Scheduler] Daily News error:", error);
        }
      },
      { timezone: "Asia/Tokyo" },
    );
    console.log("[Scheduler] Daily News scheduled (4:00 AM JST daily)");
  }

  /**
   * Dynamically add an agent to the scheduler
   * Use for runtime additions without restarting
   */
  addAgent(agent: Agent): void {
    // Remove existing task if present (for updates)
    if (this.tasks.has(agent.id)) {
      this.removeAgent(agent.id);
    }
    this.scheduleAgent(agent);
  }

  /**
   * Remove an agent from the scheduler
   * Stops the cron task and removes it from the map
   */
  removeAgent(agentId: string): void {
    const task = this.tasks.get(agentId);
    if (task) {
      task.stop();
      this.tasks.delete(agentId);
      console.log(`[Scheduler] Removed agent: ${agentId}`);
    }
  }

  /**
   * Gracefully shutdown the scheduler
   * Stops all running tasks
   */
  shutdown(): void {
    console.log("[Scheduler] Shutting down...");
    this.gmailTask?.stop();
    this.gmailTask = null;
    this.dailyPlanTask?.stop();
    this.dailyPlanTask = null;
    this.codePatrolTask?.stop();
    this.codePatrolTask = null;
    this.consistencyCheckTask?.stop();
    this.consistencyCheckTask = null;
    this.dailyNewsTask?.stop();
    this.dailyNewsTask = null;
    for (const [agentId, task] of this.tasks) {
      task.stop();
      console.log(`[Scheduler] Stopped task for agent: ${agentId}`);
    }
    this.tasks.clear();
    console.log("[Scheduler] Shutdown complete");
  }

  /**
   * Get the number of scheduled tasks (for testing/monitoring)
   */
  getTaskCount(): number {
    return this.tasks.size;
  }

  /**
   * Check if an agent is scheduled (for testing/monitoring)
   */
  hasAgent(agentId: string): boolean {
    return this.tasks.has(agentId);
  }
}
