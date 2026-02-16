# TTS Dictionary Manager

COEIROINK用の発音辞書を管理するスキル。

## 概要

英単語やアルファベット表記の単語を、COEIROINKで正しく発音させるために、カタカナ読みを辞書登録します。

## ディレクトリ構成

```
.claude/skills/tts-dict/
├── SKILL.md            # スキル定義
├── README.md           # このファイル
├── scripts/
│   └── dict.js         # 辞書操作スクリプト
└── data/
    └── dictionary.json # 辞書データ（永続化）
```

## 使用方法

### 辞書エントリ追加

```bash
node .claude/skills/tts-dict/scripts/dict.js add "Skills" "スキルズ"
```

- 第1引数: 単語（アルファベット、自動で全角に変換）
- 第2引数: 読み（カタカナ）

### 辞書一覧表示

```bash
node .claude/skills/tts-dict/scripts/dict.js list
```

### COEIROINKに適用

```bash
node .claude/skills/tts-dict/scripts/dict.js apply
```

ローカルの辞書データをCOEIROINKに送信して反映します。

### 辞書リセット

```bash
node .claude/skills/tts-dict/scripts/dict.js reset
```

ローカル辞書ファイルとCOEIROINKの辞書を両方クリアします。

## モーラ数の自動計算

スクリプトは、カタカナ読みからモーラ数を自動計算します。

計算ルール:

- カタカナ1文字 = 1モーラ
- 小書き文字（ャュョッァィゥェォヮ）= モーラとしてカウントしない
- 撥音（ン）・長音（ー）= 前の文字に含まれる

例:

- スキルズ → 4モーラ（ス+キ+ル+ズ）
- ギットハブ → 4モーラ（ギ+ッ+ト+ハ+ブ → ギ+ト+ハ+ブ）
- ディスクリプション → 7モーラ（ディ+ス+ク+リ+プ+ショ+ン → ディ+ス+ク+リ+プ+ショ）

## COEIROINK API仕様

エンドポイント: `POST http://127.0.0.1:50032/v1/set_dictionary`

リクエストボディ:

```json
{
  "dictionaryWords": [
    {
      "word": "Ｓｋｉｌｌｓ",
      "yomi": "スキルズ",
      "accent": 1,
      "numMoras": 4
    }
  ]
}
```

注意点:

- `word`: 全角アルファベット必須（自動変換されます）
- `yomi`: カタカナ読み
- `accent`: アクセント位置（デフォルト: 1）
- `numMoras`: モーラ数（自動計算されます）

## 登録済み辞書エントリ

現在、以下のエントリが登録されています:

1. Skills → スキルズ
2. SKILL.md → スキルエムディー
3. description → ディスクリプション
4. Progressive → プログレッシブ
5. Disclosure → ディスクロージャー
6. skill-creator → スキルクリエイター
7. Codex → コーデックス
8. Git → ギット
9. GitHub → ギットハブ
10. MCP → エムシーピー
11. YAML → ヤムル

## トラブルシューティング

### COEIROINKに接続できない

COEIROINKが起動していることを確認してください:

```bash
curl http://127.0.0.1:50032/v1/speakers
```

### 辞書が反映されない

辞書を追加した後、必ず`apply`コマンドを実行してください:

```bash
node .claude/skills/tts-dict/scripts/dict.js apply
```

### モーラ数が正しくない

モーラ数の計算が不正確な場合は、手動で`dictionary.json`を編集してください。
