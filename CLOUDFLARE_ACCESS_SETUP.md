# Cloudflare Access 設定手順書

このドキュメントは、Argusダッシュボードにメール認証を追加する手順を説明します。

## 所要時間

約5分

## 事前準備

- Phase 7完了（Cloudflare Tunnelでダッシュボード外部公開済み）
- アクセスを許可するメールアドレス（推奨: Gmailなど2FAが有効なアカウント）

---

## 手順1: Cloudflare Zero Trust Dashboardにアクセス

1. [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) にログイン
2. Phase 7で使用したアカウントを使用

---

## 手順2: アプリケーションを作成

1. 左メニュー → **Access** → **Applications**
2. 「Add an application」ボタンをクリック
3. 「Self-hosted」を選択
4. 「Next」をクリック

---

## 手順3: アプリケーション設定

以下の情報を入力：

| 項目                       | 値                                   |
| -------------------------- | ------------------------------------ |
| Application name           | `Argus Dashboard`                 |
| Session Duration           | `24 hours`                           |
| Enable App in App Launcher | チェックを外す（個人利用のため不要） |

**Application domain**:

| 項目      | 値                                            |
| --------- | --------------------------------------------- |
| Subdomain | `argus`                                    |
| Domain    | `yourdomain.com`（Phase 7で設定したドメイン） |

例: `argus.yourdomain.com`

「Next」をクリック

---

## 手順4: Identity Provider設定

1. 「Add a login method」セクション
2. 「One-time PIN」を選択
3. デフォルト設定のまま「Next」をクリック

**注意**: メール送信はCloudflare経由で自動的に行われます（追加設定不要）

---

## 手順5: Access Policy設定

**Policy Configuration**:

| 項目        | 値          |
| ----------- | ----------- |
| Policy name | `Self Only` |
| Action      | `Allow`     |

**Configure rules**:

1. 「Add include rule」で以下を設定:
   - Selector: `Emails`
   - Value: `your-email@example.com`（実際のメールアドレスに置き換え）

2. 「Next」をクリック

---

## 手順6: 設定を保存

1. 設定内容を確認
2. 「Add application」をクリック
3. 設定完了

---

## 動作確認

### Step 1: ログアウト状態で確認

1. ブラウザのシークレットモード（プライベートブラウジング）を開く
2. `https://argus.yourdomain.com` にアクセス
3. Cloudflare Accessのログイン画面が表示されることを確認

### Step 2: メール認証テスト

1. 登録したメールアドレスを入力
2. 「Send me a code」をクリック
3. メールでワンタイムコード（6桁）を受信
4. コードを入力
5. ダッシュボードが表示されることを確認

### Step 3: セッション確認

1. ブラウザを閉じて再度開く
2. `https://argus.yourdomain.com` にアクセス
3. ログインスキップ（セッションCookieが有効）されることを確認

---

## トラブルシューティング

### ログイン画面が表示されない

**症状**: アクセスしても認証画面が出ない

**対処**:

1. Cloudflare Zero Trust Dashboard → Access → Applications
2. `Argus Dashboard` の設定を確認
3. Application domainが正しいか確認（`argus.yourdomain.com`）

### ワンタイムコードが届かない

**症状**: メールアドレスを入力してもコードが届かない

**対処**:

1. 迷惑メールフォルダを確認
2. Cloudflareからのメール（`noreply@cloudflareaccess.com`）を許可リストに追加
3. 別のメールアドレスで試す

### 認証後もアクセスできない

**症状**: 認証成功後、ダッシュボードが表示されない

**対処**:

1. Phase 7の設定を確認（Cloudflare Tunnelが正常に動作しているか）
2. Railway Service 2（argus-tunnel）のログを確認:
   ```bash
   railway logs --service argus-tunnel
   ```

---

## セキュリティのベストプラクティス

- メール認証用アカウントはGmailなど2FAが有効なアカウントを推奨
- セッション期限は24時間（毎日1回認証）が推奨
- ブラウザのCookie設定でサードパーティCookieを許可

---

## 完了確認チェックリスト

- [x] Cloudflare AccessのApplication作成完了
- [x] メール認証が動作する（ワンタイムコードが届く）
- [x] ダッシュボードにアクセスできる
- [x] セッションCookieが機能する（24時間有効）
- [x] 登録外のメールアドレスではアクセス不可
