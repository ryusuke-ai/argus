# コーディング規約

## 言語・ランタイム

- Node.js >= 22.12.0, pnpm 10.x
- TypeScript 5.x (strict mode, ESM)
- `import/export` 統一、`node:` プレフィックス必須
- パッケージ内インポートは `.js` 拡張子付き

## 命名規則

| 対象 | スタイル | 例 |
|---|---|---|
| ファイル | kebab-case | `cli-runner.ts` |
| コンポーネント | PascalCase | `SessionList.tsx` |
| DBカラム | snake_case | `created_at` |
| 未使用変数 | `_` プレフィックス | `_req` |

## エラーハンドリング

- `success: boolean` フラグで結果を返す（throwしない）
- ログ: `console.error("[ModuleName] description", error)`

## テスト

- ソースと同ディレクトリにコロケーション (`foo.ts` + `foo.test.ts`)
- dashboard: jsdom + Testing Library + jest-dom
- `vi.mock()` でモジュールモック

## フォーマット

- ダブルクォート、セミコロンあり、末尾カンマあり（Prettier）
