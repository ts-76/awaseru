# 自分のCloudflareアカウントへ配置する

Deploy to Cloudflareボタンは、`deploy/cloudflare` にある独立したテンプレートを使います。元のアプリと同じソースから生成し、CloudflareがD1を新規作成して、複製先の `wrangler.json` にデータベースIDを保存します。既存環境のWorker名・アカウントID・D1 IDは含みません。

## ボタンで配置する

1. 元のリポジトリが公開されていることを確認し、READMEのDeploy to Cloudflareボタンを開きます。
2. GitHubとCloudflareにログインし、複製先リポジトリ、Worker名、D1名を指定します。
3. ビルドコマンドは `npm run build`、デプロイコマンドは `npm run deploy` を使います。Node.jsは `.node-version` に合わせて26を使います。
4. 配置後、以下の認証設定を行います。認証を設定するまで、日程の作成とMCPへのアクセスはできません。

`npm run deploy` は `DB` というバインディング名でD1マイグレーションを適用してからWorkerを公開します。D1名を変更しても同じバインディングを使います。複製後の手動更新では、そのリポジトリで `npm ci`、`npm run build`、`npm run deploy` を実行します。テンプレートの配置には通常のアプリ用 `DEPLOY_*` は不要です。

## 認証を設定する

Cloudflare Zero Trustで、作成用とMCP用のAccessアプリケーションを別々に作ります。所有者のメールアドレスだけを許可し、次のパスを保護してください。

- 作成用: `/create` と `/api/create`（その配下も含む）
- MCP用: `/mcp`（その配下も含む）

配置したWorkerに次の4つのSecretを登録します。テンプレートを複製したリポジトリから、`npx wrangler secret put <名前> --config wrangler.json` で入力できます。

| Secret               | 設定する値                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| `ACCESS_OWNER_EMAIL` | 所有者のメールアドレス                                                     |
| `ACCESS_TEAM_DOMAIN` | `example.cloudflareaccess.com` 形式のチームドメイン。`https://` は付けない |
| `ACCESS_CREATE_AUD`  | 作成用AccessアプリケーションのAUD                                          |
| `ACCESS_MCP_AUD`     | MCP用AccessアプリケーションのAUD。作成用とは別の値                         |

未設定または不正な設定では、作成とMCPの保護対象パスはHTTP 503を返します。認証を省略して匿名の作成を許可する設定はありません。回答リンクは参加者がログインせずに利用する仕様です。Accessアプリケーションの設定はボタンでは自動作成されません。

MCPの接続・利用手順は[アプリのREADME](https://github.com/ts-76/awaseru#readme)を参照してください。

## 元のアプリを更新したとき

この節は `ts-76/awaseru` の保守者向けです。ボタンで複製したテンプレートには生成コマンドは含まれません。

```sh
npm run template:generate
npm run template:check
npm run template:verify
```

`template:generate` は許可したアプリのファイルだけを `deploy/cloudflare/app` にコピーし、テンプレート用のpackage.json・Wrangler設定・ロックファイルを出力します。`.env`、`void.lock.json`、ビルド結果、ローカル認証情報はコピーしません。生成先を直接編集せず、元のソースまたは `scripts/cloudflare-template` を編集して再生成します。

Void 1.5.0は型付き設定とルートのWrangler設定を併用できないため、テンプレートは `app` をVoidのルートにしています。ビルドではローカル用の識別子を使い、公開時はテンプレートのルートにあるWrangler設定だけを使います。元のアプリの通常のVoidデプロイ手順と `DEPLOY_*` の保護は維持しています。

CIは生成元との差分を検出し、資格情報を持たない一時ディレクトリでビルド、Wranglerのdry-run、ローカルD1のマイグレーションと、Wranglerで起動したアプリの応答を確認します。ルートからの転送、認証未設定時のHTTP 503、存在しない回答ページのHTTP 404が確認対象です。Cloudflare上でのリソース作成や、ボタンからの実際の複製・配置は、このローカル確認とは別の検証です。

公式仕様: [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
