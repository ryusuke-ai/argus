---
name: tts-dict
description: COEIROINKの発音辞書を管理。「辞書登録」「英単語登録」で発動。
---

# TTS Dictionary

英単語の読み方をCOEIROINKに登録する。

## クイックスタート

```bash
# 1. まず辞書の健全性を確認（TTS前に必須）
node .claude/skills/tts-dict/scripts/dict.js healthcheck

# 2. 英単語を自動登録（LLM経由で読み取得）
node .claude/skills/tts-dict/scripts/dict.js auto-add Claude OpenAI ChatGPT --apply

# 3. 発音を確認
node .claude/skills/tts-dict/scripts/dict.js verify Claude OpenAI ChatGPT

# 4. dialogue.jsonから一括登録
node .claude/skills/tts-dict/scripts/auto-register.js --input dialogue.json
```

## コマンド

| コマンド                      | 説明                                    |
| ----------------------------- | --------------------------------------- |
| `healthcheck`                 | 辞書の健全性チェック（**TTS前に必須**） |
| `auto-add <words...> --apply` | LLMで読み取得→登録→適用                 |
| `add <word> <yomi>`           | 手動登録                                |
| `check <words...>`            | 登録確認                                |
| `verify <words...>`           | **COEIROINKの実際の発音を確認**         |
| `apply`                       | COEIROINKに適用                         |
| `list`                        | 一覧表示                                |
| `reset`                       | 辞書をリセット                          |

## チェックリスト（TTS生成前）

- [ ] `dict.js healthcheck` が成功
- [ ] COEIROINKが起動している
- [ ] 主要な英単語（Git, git, GitHub等）が**大文字・小文字両方で登録済み**
- [ ] `dict.js verify <主要単語>` で発音を確認済み

## よくある問題と対処法

### 問題1: JSON解析エラー / マージコンフリクト

**症状:**

```
SyntaxError: Expected double-quoted property name in JSON at position XXX
```

**原因:** `dictionary.json` にGitのマージコンフリクトマーカーが残っている

**対処:**

```bash
# 1. コンフリクトマーカーを検索
grep -n "<<<<<<" .claude/skills/tts-dict/data/dictionary.json

# 2. 手動で修正（コンフリクトマーカーを削除）
# <<<<<<< HEAD, =======, >>>>>>> の行を削除

# 3. JSON構文を検証
node -e "JSON.parse(require('fs').readFileSync('.claude/skills/tts-dict/data/dictionary.json'))"
```

### 問題2: 大文字の単語が正しく読まれない

**症状:** "Git" が "ジーアイティー" と読まれる

**原因:** COEIROINKは大文字小文字を区別する。"git" は登録済みでも "Git" は別エントリとして必要。

**対処:**

```bash
# 大文字・小文字両方を登録
node .claude/skills/tts-dict/scripts/dict.js add "Git" "ギット"
node .claude/skills/tts-dict/scripts/dict.js add "git" "ギット"
node .claude/skills/tts-dict/scripts/dict.js apply

# 発音を確認
node .claude/skills/tts-dict/scripts/dict.js verify Git git
```

### 問題3: 辞書適用したのに発音が変わらない

**症状:** `apply` は成功するが、TTS出力の発音が変わらない

**対処:**

```bash
# 1. 辞書を再適用
node .claude/skills/tts-dict/scripts/dict.js apply

# 2. estimate_prosody APIで発音を直接確認
node .claude/skills/tts-dict/scripts/dict.js verify <word>
```

## 注意: ハイフン付き単語の登録

ハイフンを含む英単語（例: `obsidian-skills`, `claude-code`）は**TTS生成前に必ずカタカナ読みへの置換が必要**です。

### 問題

- COEIROINK辞書はハイフン付き単語を正しくマッチングできない場合がある
- 辞書に登録されていても、TTS時に分割されて読まれる可能性

### 対処法

1. **TTS用テキストではハイフン付き単語をカタカナ読みに置換**
   - `obsidian-skills` → `オブシディアンスキルズ`
   - `claude-code` → `クロードコード`

2. **video-plannerを使う場合**: `verify-tts.js`が自動検出し`dialogue-fixed.json`を生成
   - TTS生成: `dialogue-fixed.json`を使用
   - テロップ表示: `dialogue.json`（オリジナル）を使用

3. **手動登録の場合**: 辞書登録だけでなく、テキスト側も置換が必要

```bash
# 辞書登録（参照用）
node .claude/skills/tts-dict/scripts/dict.js add "obsidian-skills" "オブシディアンスキルズ" --apply

# TTS用テキストで置換してから生成
sed 's/obsidian-skills/オブシディアンスキルズ/g' input.txt | node generate-tts.js
```

## 前提

- COEIROINK: localhost:50032
- LLM API: `OPENROUTER_API_KEY`
