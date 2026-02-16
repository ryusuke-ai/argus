// apps/slack-bot/src/handlers/inbox/daily-plan-trigger.ts

/**
 * Orchestrator の /api/daily-plan を呼び出して Daily Plan を再生成・投稿する。
 * Fire-and-forget: 失敗しても呼び出し元には影響しない。
 */
export function triggerDailyPlanUpdate(): void {
  const orchestratorPort = process.env.ORCHESTRATOR_PORT || "3950";
  const url = `http://localhost:${orchestratorPort}/api/daily-plan`;

  fetch(url, { method: "POST" })
    .then((res) => {
      if (!res.ok) {
        console.warn(`[inbox] Daily plan update failed: HTTP ${res.status}`);
      } else {
        console.log("[inbox] Daily plan update triggered");
      }
    })
    .catch((err) => {
      console.warn("[inbox] Daily plan update request failed:", err.message);
    });
}
