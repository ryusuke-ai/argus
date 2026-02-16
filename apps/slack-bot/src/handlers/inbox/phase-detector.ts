// apps/slack-bot/src/handlers/inbox/phase-detector.ts

/**
 * タスク内容からフェーズ定義を返す。
 * 該当するパターンがない場合は null（フェーズなし = フラット表示）。
 */
export function detectTaskPhases(
  message: string,
  _intent: string,
): Array<{ label: string; estimateSec: number }> | null {
  const msg = message.toLowerCase();

  // 動画作成タスク
  if (msg.includes("動画") || msg.includes("ビデオ") || msg.includes("video")) {
    return [
      { label: "Phase 1: シナリオ生成", estimateSec: 120 },
      { label: "Phase 2: ダイアログ生成", estimateSec: 180 },
      { label: "Phase 3: 演出計画・素材生成", estimateSec: 360 },
      { label: "Phase 4: レンダリング", estimateSec: 240 },
    ];
  }

  // ポッドキャスト作成タスク
  if (msg.includes("ポッドキャスト") || msg.includes("podcast")) {
    return [
      { label: "Phase 1: リサーチ", estimateSec: 360 },
      { label: "Phase 2: スクリプト生成", estimateSec: 180 },
      { label: "Phase 3: 音声合成・ミキシング", estimateSec: 240 },
    ];
  }

  // プレゼン資料作成タスク
  if (
    msg.includes("プレゼン") ||
    msg.includes("スライド") ||
    msg.includes("資料作成") ||
    msg.includes("presentation")
  ) {
    return [
      { label: "Phase 1: 構成設計", estimateSec: 120 },
      { label: "Phase 2: コンテンツ生成", estimateSec: 180 },
      { label: "Phase 3: デザイン・素材生成", estimateSec: 360 },
      { label: "Phase 4: レンダリング", estimateSec: 120 },
    ];
  }

  return null;
}
