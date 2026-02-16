#!/usr/bin/env node

/**
 * COEIROINK 話者一覧取得スクリプト
 * 利用可能な話者とスタイルIDを表示
 */

const API_BASE = "http://localhost:50032";

async function getSpeakers() {
  try {
    const response = await fetch(`${API_BASE}/v1/speakers`);

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const speakers = await response.json();

    console.log("=== COEIROINK 利用可能な話者一覧 ===\n");

    speakers.forEach((speaker) => {
      console.log(`話者名: ${speaker.speakerName}`);
      console.log(`UUID: ${speaker.speakerUuid}`);
      console.log(`バージョン: ${speaker.version}`);
      console.log("スタイル:");

      speaker.styles.forEach((style) => {
        console.log(`  - ${style.styleName} (ID: ${style.styleId})`);
      });

      console.log("");
    });

    return speakers;
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") {
      console.error("エラー: COEIROINKサーバーに接続できません。");
      console.error(
        "localhost:50032でCOEIROINKが起動しているか確認してください。",
      );
    } else {
      console.error("エラー:", error.message);
    }
    process.exit(1);
  }
}

// スクリプトとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  getSpeakers();
}

export { getSpeakers };
