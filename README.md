# awaseru

Cloudflare WorkersとD1で動く日本語の日程調整ツールです。参加者は共有URLから回答できます。作成者用の画面とMCPサーバーを同梱しています。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fts-76%2Fawaseru%2Ftree%2Fmain%2Fdeploy%2Fcloudflare)

## できること

- カレンダーで複数の日付を選び、同じ開始・終了時刻の候補を一括追加
- 1〜30件の候補に○・△・×で回答し、候補ごとの人数を集計
- ログイン後に本人が作った日程調整を一覧表示・削除
- 管理URLから受付の締切・日程確定・受付再開
- MCPから日程調整を作成・取得し、回答や状態を更新

日時の入力と表示は日本時間（JST）です。候補日時は作成後に変更しません。締切・確定後は回答の追加と編集を受け付けず、受付を再開すると日程確定が解除されます。公開の全日程一覧やカレンダー同期はありません。

共有URLを知る人は説明・参加者名・回答・コメントを閲覧できます。管理URLと回答編集URLには秘密キーが含まれるため、共有相手を確認して保管してください。管理・編集URLを紛失した場合、キーの再発行や本人確認による復旧はありません。

## Cloudflareへ公開

上のボタンから、自分のCloudflareアカウントにアプリを公開します。配布用テンプレートは [`deploy/cloudflare`](deploy/cloudflare) にあります。

1. Cloudflareへログインし、GitHubとの接続を許可します。
2. 作成するリポジトリ名・Worker名・D1名を確認します。
3. ビルドとデプロイを実行します。
4. 公開後に、下の認証設定を行います。

ボタンからの公開とCloudflare Accessの設定は別の手順です。**認証設定が終わるまで、日程調整の作成とMCPの利用はできません。** 保護された経路は設定不足の場合に503で拒否します。

テンプレートの構成と手動での実行方法は[配布用テンプレートの手順](docs/deploy-cloudflare.md)を参照してください。既存のWorker・D1へ更新する場合は、[開発・運用の詳細](docs/development.md#cloudflareへデプロイ)の環境変数を使います。

## 認証設定

作成ページ `/create` と作成API `/api/create` はCloudflare Accessで保護します。MCPの `/mcp` はManaged OAuthを使います。共有URLでの閲覧・回答と、秘密キーによる管理はログインせずに利用できます。

Cloudflare Accessで作成用とMCP用のアプリを分け、本人だけを許可するポリシーを設定します。Workerには次の4項目をSecretとして登録してください。

| Secret               | 設定する値                                              |
| -------------------- | ------------------------------------------------------- |
| `ACCESS_OWNER_EMAIL` | 利用を許可する本人のメールアドレス                      |
| `ACCESS_TEAM_DOMAIN` | `your-team.cloudflareaccess.com` の形式のチームドメイン |
| `ACCESS_CREATE_AUD`  | 作成用Accessアプリの64文字のAUD                         |
| `ACCESS_MCP_AUD`     | MCP用Accessアプリの64文字のAUD                          |

作成用とMCP用には異なるAUDを使います。アプリはAccess JWTの署名・発行者・対象アプリ・有効期限と、設定した本人のメールアドレスを検証します。固定MCPトークンやローカル認証バイパスはありません。

具体的な設定は[Cloudflare Accessの手順](docs/cloudflare-access.md)を参照してください。

## MCP接続

認証設定を終えたら、Codexで次を実行します。URLは自分のWorkerのURLに置き換えてください。

```sh
codex mcp add awaseru --url https://your-worker.your-subdomain.workers.dev/mcp
codex mcp login awaseru
```

ブラウザで許可されたCloudflareアカウントにログインし、接続後にツールの一覧取得と実行を確認します。管理操作にはイベントの管理キー、回答編集には本人の編集キーも必要です。

ツールの一覧、引数、再送時の扱いは[開発・運用の詳細](docs/development.md#mcp接続)に記載しています。

## 手元で動かす

Node.js 26とnpmを使います。Void 1.2.1、React 19、Vite+で構成しています。

```sh
npm ci --ignore-scripts
npm run typecheck
npm run db:migrate:local
npm run dev
```

`http://localhost:5173` を開きます。認証設定なしでもローカルでビルドできますが、新規作成とMCPにはAccessの有効な認証が必要です。

ローカル設定にはGit管理外の `.env` を使います。Voidは `.dev.vars` や `.env.example` に対応していません。D1のローカルデータは `.void` / `.wrangler` に保存され、これらを削除すると失われます。

## 開発・運用の詳細

- [環境変数・既存環境へのデプロイ・マイグレーション](docs/development.md#cloudflareへデプロイ)
- [MCPツールと秘密キー](docs/development.md#mcp接続)
- [保存・認可・競合時の動作](docs/development.md#保存認可競合)
- [検査コマンドと検証範囲](docs/development.md#確認コマンド)
- [本人一覧への追加と削除、カレンダーの一括追加](docs/development.md#本人の日程調整一覧)
