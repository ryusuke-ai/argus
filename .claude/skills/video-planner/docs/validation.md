# JSONバリデーション

各フェーズの出力JSONはZodでバリデーションされる。

## 自動バリデーション

以下のスクリプトは出力時に自動でバリデーションを実行:

| スクリプト           | バリデーション対象                                |
| -------------------- | ------------------------------------------------- |
| `openrouter-json.js` | 出力JSON                                          |
| `generate-json.js`   | 出力JSON                                          |
| `merge-script.js`    | 入力（dialogue, direction）+ 出力（video-script） |

## 手動バリデーション

```bash
node .claude/skills/video-planner/scripts/validate-json.js \
  --schema <schema-name> \
  --file <json-file>
```

### スキーマ名

| スキーマ名     | 対象                 |
| -------------- | -------------------- |
| `scenario`     | Phase 1 シナリオ構成 |
| `dialogue`     | Phase 2 ダイアログ   |
| `direction`    | Phase 3-1 演出計画   |
| `video-script` | Phase 3-4 最終出力   |

### オプション

| オプション | 説明                               |
| ---------- | ---------------------------------- |
| `--fix`    | 自動修正可能なエラーを修正して保存 |
| `--quiet`  | 成功時のメッセージを抑制           |

## エラー出力例

```
❌ dialogue バリデーションエラー (2件)
============================================================

📍 [mode]
   エラー: Invalid enum value. Expected 'dialogue' | 'narration', received 'invalid'
   受信値: invalid
   → 該当箇所を修正してください

📍 [segments]
   エラー: Array must contain at least 1 element(s)
   → 該当箇所を修正してください

============================================================
```

## Zodスキーマ定義

`schemas/zod-schemas.js` に全スキーマを定義。

### highlight フィールド（direction）

```javascript
{
  text: string,  // 要点テキスト（10-20文字）
  sound: "shakin" | "pa" | "jean"  // 効果音（必須）
}
```

文字列形式（旧形式）は非対応。オブジェクト形式のみ許可。
