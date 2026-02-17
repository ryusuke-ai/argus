// apps/slack-bot/src/utils/progress-reporter.ts
//
// 単一メッセージを chat.update で1行更新する進捗レポーター。
// スレッドに大量のメッセージを投稿する代わりに、1つのメッセージを
// chat.update で上書きし、常に最新のステップだけを1行で表示する。

import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";

type Block = Record<string, unknown>;

interface ProgressStep {
  text: string;
  status: "running" | "done";
}

interface ProgressPhase {
  label: string;
  estimateSec: number;
  status: "pending" | "running" | "done";
  startedAt?: number;
  completedAt?: number;
}

/** chat.update のスロットル間隔（ms） */
const UPDATE_THROTTLE_MS = 2000;

/** カウントダウン更新の間隔（ms）— Slack rate limit 考慮で5秒 */
const COUNTDOWN_INTERVAL_MS = 5000;

export class ProgressReporter {
  private client: WebClient;
  private channel: string;
  private threadTs: string;
  private taskLabel: string;
  private estimateText: string;

  private messageTs: string | null = null;
  private steps: ProgressStep[] = [];
  private phases: ProgressPhase[] = [];
  private startTime = Date.now();
  private lastUpdateTime = 0;
  private pendingUpdate = false;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private finished = false;

  constructor(opts: {
    client: WebClient;
    channel: string;
    threadTs: string;
    taskLabel: string;
    estimateText?: string;
  }) {
    this.client = opts.client;
    this.channel = opts.channel;
    this.threadTs = opts.threadTs;
    this.taskLabel = opts.taskLabel;
    this.estimateText = opts.estimateText || "";
  }

  /**
   * 事前定義フェーズを設定する。
   * 最初のフェーズを自動的に "running" にする。
   */
  async setPhases(
    phases: Array<{ label: string; estimateSec: number }>,
  ): Promise<void> {
    this.phases = phases.map((p, i) => ({
      label: p.label,
      estimateSec: p.estimateSec,
      status: i === 0 ? "running" : "pending",
      startedAt: i === 0 ? Date.now() : undefined,
    }));
    await this.throttledUpdate();
  }

  /**
   * 現在のフェーズを完了し、次のフェーズに進む。
   */
  async advancePhase(doneText?: string): Promise<void> {
    const current = this.phases.find((p) => p.status === "running");
    if (current) {
      current.status = "done";
      current.completedAt = Date.now();
      if (doneText) current.label = doneText;
    }
    // 動的ステップをクリア（新フェーズで仕切り直し）
    this.steps = [];
    const next = this.phases.find((p) => p.status === "pending");
    if (next) {
      next.status = "running";
      next.startedAt = Date.now();
    }
    await this.throttledUpdate();
  }

  /**
   * 進捗メッセージを投稿して追跡を開始する。
   * カウントダウンタイマーも開始し、5秒ごとに経過・残り時間を更新する。
   */
  async start(): Promise<void> {
    try {
      const result = await this.client.chat.postMessage({
        channel: this.channel,
        thread_ts: this.threadTs,
        text: `⏳ ${this.taskLabel}`,
        blocks: this.buildBlocks() as unknown as KnownBlock[],
      });
      this.messageTs = result.ts as string;

      // カウントダウンタイマー: 5秒ごとに表示を更新
      this.countdownTimer = setInterval(() => {
        if (this.finished || !this.messageTs) {
          if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
          }
          return;
        }
        this.doUpdate().catch((err) => {
          console.error("[progress-reporter] Countdown update failed:", err);
        });
      }, COUNTDOWN_INTERVAL_MS);
    } catch (err) {
      console.error("[progress-reporter] Failed to post initial message:", err);
    }
  }

  /**
   * 新しいステップを追加する（前のステップは自動的に done になる）。
   */
  async addStep(text: string): Promise<void> {
    // 前のステップを完了にする
    const last = this.steps[this.steps.length - 1];
    if (last && last.status === "running") {
      last.status = "done";
    }
    this.steps.push({ text, status: "running" });
    await this.throttledUpdate();
  }

  /**
   * 現在のステップを完了にする（次のステップを追加せず、単に完了マークをつける）。
   */
  async completeCurrentStep(doneText?: string): Promise<void> {
    const last = this.steps[this.steps.length - 1];
    if (last && last.status === "running") {
      if (doneText) last.text = doneText;
      last.status = "done";
      await this.throttledUpdate();
    }
  }

  /**
   * 処理完了時に進捗メッセージを削除する。
   * 結果は呼び出し側が別途投稿するため、進捗メッセージは不要。
   * finished フラグで doUpdate() のレースコンディションを防止する。
   */
  async finish(): Promise<void> {
    this.finished = true;

    // 全タイマーをクリア
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    if (!this.messageTs) return;

    try {
      await this.client.chat.delete({
        channel: this.channel,
        ts: this.messageTs,
      });
    } catch {
      // Intentionally ignored: message may already be deleted by user or Slack
    }
    this.messageTs = null;
  }

  // --- Private ---

  private buildBlocks(): Block[] {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const blocks: Block[] = [];

    if (this.phases.length > 0) {
      blocks.push(...this.buildPhasedBlocks(elapsed));
    } else {
      blocks.push(...this.buildFlatBlocks(elapsed));
    }

    return blocks;
  }

  /**
   * フェーズあり: context ブロック1つの1行表示。
   * ステップが変わるたびにこの1行がコロコロ切り替わる。
   */
  private buildPhasedBlocks(elapsed: number): Block[] {
    const runningPhase = this.phases.find((p) => p.status === "running");
    const currentStep = this.steps[this.steps.length - 1];

    const parts: string[] = [];
    parts.push(`⏳ ${formatDuration(elapsed)}`);
    if (runningPhase) parts.push(runningPhase.label);
    if (currentStep) parts.push(currentStep.text);

    return [
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: parts.join(" · ") }],
      },
    ];
  }

  /**
   * フェーズなし: context ブロック1つの1行表示。
   */
  private buildFlatBlocks(elapsed: number): Block[] {
    const currentStep = this.steps[this.steps.length - 1];
    const text = currentStep
      ? `⏳ ${formatDuration(elapsed)} · ${currentStep.text}`
      : `⏳ ${formatDuration(elapsed)} · 処理を開始しています...`;

    return [
      {
        type: "context",
        elements: [{ type: "mrkdwn", text }],
      },
    ];
  }

  /**
   * フェーズの進捗から残り時間を推定する。
   *
   * 比率の計算:
   * - 完了フェーズがある場合: 完了フェーズの実績/見積もり比率を使用
   * - 完了フェーズがない場合: 実行中フェーズの経過/見積もり比率を使用
   *   （見積もりを超過している場合、残りフェーズにもその超過率を適用）
   */
  private estimateRemainingTime(): number | null {
    if (this.phases.length === 0) return null;

    const donePhases = this.phases.filter((p) => p.status === "done");
    const runningPhase = this.phases.find((p) => p.status === "running");
    const pendingPhases = this.phases.filter((p) => p.status === "pending");

    if (!runningPhase && pendingPhases.length === 0) return 0;

    const totalElapsed = (Date.now() - this.startTime) / 1000;
    const totalEstimate = this.phases.reduce(
      (sum, p) => sum + p.estimateSec,
      0,
    );

    // Phase 1（完了フェーズなし）: 単純に「合計見積もり - 経過」で算出
    // Phase 1 は変動が大きいため比率計算せず静的見積もりを信頼する
    if (donePhases.length === 0) {
      const remaining = totalEstimate - totalElapsed;
      // 超過時: 経過の10%を残りと推定（もうすぐ終わるはず）
      return Math.round(Math.max(remaining, totalElapsed * 0.1));
    }

    // Phase 2 以降: 完了フェーズの実績比率で動的に推定
    const totalActual = donePhases.reduce((sum, p) => {
      const actual = (p.completedAt || 0) - (p.startedAt || 0);
      return sum + actual / 1000;
    }, 0);
    const doneEstimate = donePhases.reduce((sum, p) => sum + p.estimateSec, 0);
    const ratio =
      doneEstimate > 0 ? Math.min(totalActual / doneEstimate, 3.0) : 1.0;

    // 実行中フェーズの経過時間
    const elapsedInPhase = runningPhase?.startedAt
      ? (Date.now() - runningPhase.startedAt) / 1000
      : 0;

    let remaining = 0;
    if (runningPhase) {
      const adjustedEstimate = runningPhase.estimateSec * ratio;
      if (elapsedInPhase < adjustedEstimate) {
        remaining += adjustedEstimate - elapsedInPhase;
      } else {
        remaining += elapsedInPhase * 0.1;
      }
    }

    for (const phase of pendingPhases) {
      remaining += phase.estimateSec * ratio;
    }

    return Math.round(remaining);
  }

  private async throttledUpdate(): Promise<void> {
    if (!this.messageTs) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;

    if (timeSinceLastUpdate >= UPDATE_THROTTLE_MS) {
      // 即時更新
      this.lastUpdateTime = now;
      this.pendingUpdate = false;
      await this.doUpdate();
    } else if (!this.pendingUpdate) {
      // 次のスロットルウィンドウで更新予約
      this.pendingUpdate = true;
      const delay = UPDATE_THROTTLE_MS - timeSinceLastUpdate;
      this.updateTimer = setTimeout(async () => {
        this.updateTimer = null;
        this.pendingUpdate = false;
        this.lastUpdateTime = Date.now();
        await this.doUpdate();
      }, delay);
    }
    // pendingUpdate が既に true なら何もしない（次の更新で最新状態が反映される）
  }

  private async doUpdate(): Promise<void> {
    if (!this.messageTs || this.finished) return;
    try {
      await this.client.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: `⏳ ${this.taskLabel}`,
        blocks: this.buildBlocks() as unknown as KnownBlock[],
      });
    } catch (err: unknown) {
      const slackErr = err as { data?: { error?: string } } | undefined;
      if (slackErr?.data?.error === "message_not_found") {
        // メッセージが削除された場合は追跡を停止
        this.messageTs = null;
      } else {
        console.error(
          "[progress-reporter] Failed to update message:",
          slackErr?.data?.error || err,
        );
      }
    }
  }
}

/** 秒数を読みやすい文字列に変換 */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${min}分${s}秒` : `${min}分`;
}
