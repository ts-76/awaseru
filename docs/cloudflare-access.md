# Cloudflare Access の設定

対象アカウントは tsapp (`934c6255d681d05e1fa9903560de8a59`)。他のアプリは変更しない。

## ログイン方法

Zero Trust → Integrations → Identity providers で Cloudflare を追加する。`Restrict to account members` を有効にする。メールOTPは追加しない。

各アプリの Allow ポリシーは、Include の Emails を `ts.createlink@gmail.com`、Require の Login methods を上記 Cloudflare にする。アカウントメンバー全員を許可するルールや Everyone は使わない。

## 作成画面とAPI

Self-hosted application `awaseru — 作成` を作る。対象は次の2パスだけ。

```text
awaseru.ts-create.workers.dev/create
awaseru.ts-create.workers.dev/api/create
```

Accessのパス指定は配下のパスも含むため、`/create/polls`（本人一覧）と `/create/connect`（MCP接続案内）もこのアプリで保護される。

Worker全体やホスト全体を保護すると参加者の閲覧・回答もログイン必須になるため、指定しない。`/p/*` と `/api/polls/*` は公開のままにする。旧作成API `POST /api/polls` はアプリ側で無効化する。

ログイン方法は Cloudflare のみ。アプリの Audience (AUD) を作成用として控える。

## MCP

Self-hosted application `awaseru — MCP` を別に作り、対象を次のパスにする。

```text
awaseru.ts-create.workers.dev/mcp
```

同じ本人限定ポリシーと Cloudflare ログイン方法を使い、Advanced settings で Managed OAuth を有効にする。

Codex CLI の OAuth コールバック用に `Allow localhost clients` と `Allow loopback clients` を有効にする。その他のアプリ用HTTPSリダイレクト先は追加しない。動的クライアント登録を有効にする。アクセス・トークンは短時間、Grant session は本人の再ログイン運用に合わせる。MCP用の AUD を作成用と分けて控える。

## アプリへ渡す値

- Zero Trust の team domain（`<team-name>.cloudflareaccess.com`、httpsなし）
- 作成用 AUD
- MCP用 AUD

これらは公開の識別子で、パスワードやAPIトークンではない。アプリは認証設定がない場合に503を返し、匿名や固定MCPトークンで代用しない。

Managed OAuthのBearerトークンは不透明な値。Cloudflareが認証して `Cf-Access-Jwt-Assertion` をWorkerへ渡す。アプリはこのJWTの署名・issuer・対象AUD・期限・本人を検証する。

## Codexでの確認

Cloudflare設定とWorker公開後に実行する。登録だけでは接続確認にならない。

```sh
codex mcp add awaseru --url https://awaseru.ts-create.workers.dev/mcp
codex mcp login awaseru
```

ブラウザでCloudflareに本人としてログインする。CodexのOAuth完了と5ツールの取得、安全な `get_poll` 呼び出しまで確認する。作成用AUDとMCP用AUDを入れ替えたJWT・偽装emailヘッダー・失効JWTを拒否することも別に検査する。

## 現在の環境での制約

2026-10-30、Wrangler OAuthはAccess操作を403で拒否したが、ユーザー指定の `cf` は別の既存OAuth認証でAccess設定権限を持っていた。既存の組織とCloudflare IdPを再利用し、あわせる専用の作成/MCPアプリを追加した。既存12アプリの設定hash不変を確認済み。`cf deploy --dry-run` はVoidをHonoと誤判定して停止するため、アプリ本体は既存のVoid公開手順を使う。Access設定・Workerの3つの環境値はcfで反映。Codexの本人ログインは別途確認する。

## 公式資料

- [Cloudflare as identity provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/)
- [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
- [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)

## このWorkerの設定値

- `ACCESS_TEAM_DOMAIN`: `internal-tools-tslab-app.cloudflareaccess.com`
- `ACCESS_CREATE_AUD`: `b3a83537972a3e762ba151f94d657001a4706d97bea4cf2fb17583456ec52f54`
- `ACCESS_MCP_AUD`: `8389b72b9040083171fe88eeddbbb09f678a3f6f612d661181bd2910e2fb38c1`
- 作成Access app: `72821f7a-58dd-41f9-a839-56470ce3bd0b`
- MCP Access app: `17fa5d0c-49ee-480b-97ef-3a655c4aede8`

3値は識別子だが、Voidのserver env仕様に従いWorker secretsとして登録する。`cf workers secrets bulk` のJSON Merge Patchで追加し、その他のbindingは保持する。
