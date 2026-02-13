# gen-rich-image トラブルシューティング

## よくあるエラー

### APIキーエラー
```
Error: GOOGLE_API_KEY environment variable is not set
```
→ 環境変数 `GOOGLE_API_KEY` を設定してください

### パッケージ未インストール
```
Error: Cannot find package '@google/generative-ai'
```
→ `npm install @google/generative-ai` を実行してください

### 画像生成失敗
```
Error: No image was generated
```
→ プロンプト内容がコンテンツポリシーに違反している可能性があります。プロンプトを変更して再試行してください

## AIエージェント向け注意事項

### やってはいけないこと

1. **問題発生時に安易に英語プロンプトに切り替えない** - Gemini APIは日本語テキスト生成に対応している。日本語が表示されない場合は、プロンプトやコードのバグを疑うこと

2. **テンプレート変数の置換を確認せずに実行しない** - `buildPrompt`関数が全ての変数（`{{content}}`, `{{title}}`等）を正しく置換しているか確認すること

3. **根本原因を調査せずに別のアプローチに逃げない** - エラーや期待と異なる結果が出た場合、まず`config.json`のテンプレートと`generate.js`の処理を確認すること

### よくある問題と対処

| 症状 | 原因 | 対処 |
|------|------|------|
| テキストが表示されない・文字化け | テンプレート変数が未置換 / textInstruction指示の問題 | `buildPrompt`の置換リストと`generateImage`の指示文を確認 |
| 内容がプロンプトと異なる | `{{変数}}`がそのまま出力されている | `config.json`の変数名と`buildPrompt`の置換リストを照合 |
| 期待したモードと違う結果 | モード指定ミス / デフォルトモードが適用 | `--mode`オプションを明示的に指定 |

### デバッグ時の確認ポイント

1. **config.json** - 使用するモードの`promptTemplate`に含まれる変数名を確認
2. **generate.js buildPrompt()** - 全ての変数が置換リストに含まれているか確認
3. **generate.js generateImage()** - `textInstruction`がパターンに適切か確認
4. **実行時ログ** - 「Prompt:」で出力される内容に`{{変数}}`が残っていないか確認
