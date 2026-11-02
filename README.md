# awaseru

Cloudflare Workers / D1 上で動く日本語の日程調整ツールです。同じWorkerの `/mcp` に、公式MCP SDKのStreamable HTTPサーバーを同梱しています。Void 1.2.1、React 19、Vite+を使用します。

## 公開先

- URL: https://awaseru.ts-create.workers.dev
- MCP: https://awaseru.ts-create.workers.dev/mcp
- Cloudflareアカウント: tsapp
- Worker: `awaseru`（2026-10-31 に `awaseru-scheduler-20261030` から改名。旧URLは廃止）
- D1: `awaseru-scheduler-20261030-db`

作成ページ `/create`・作成API `/api/create` はCloudflare Access、MCPはManaged OAuthで本人 `ts.createlink@gmail.com` だけに制限します。共有イベント・回答・秘密キーでの管理は公開のままです。認証設定の手順は [docs/cloudflare-access.md](docs/cloudflare-access.md) にあります。

認証の実装・署名fixture検査と、公開Accessの設定・本人ログイン・Codex OAuthの実接続は別の確認です。後者の結果は作業プレイブックに記録します。

## できること

- 1〜30件の候補日時を登録し、参加URLを共有
- 参加者が全候補へ○・△・×で回答、本人の編集URLで更新
- 回答一覧と候補ごとの人数を表示
- 管理URLで締切・日程確定・受付再開
- MCPから作成・取得・回答・編集・状態変更

日時の入力と表示は日本時間（JST）です。候補日時は作成後に変更しません。締切・確定後は回答の追加と編集を受け付けません。受付再開で日程確定は解除されます。公開のイベント一覧やカレンダー同期はありません。

共有URLを知る人は、説明・参加者名・回答・コメントを閲覧できます。管理URLと回答編集URLには秘密キーが含まれます。共有相手を確認し、保管してください。管理・編集URLを紛失した場合、キーの再発行や本人確認による復旧はありません。

## 手元で動かす

Node.js 26（開発時26.13.0）とnpmを使用します。`.npmrc` は依存パッケージの公開後3日待機とinstall scripts拒否を設定しています。明示的に実行するVoid CLIで必要な準備を行います。

```sh
npm ci --ignore-scripts
npm run typecheck
npm run db:migrate:local
npm run dev
```

`http://localhost:5173` を開きます。ローカルD1のデータは `.void` / `.wrangler` の開発用ストレージへ保存されます。これらを削除するとローカルデータが失われます。

`env.ts` の次の3項目を `.env` に設定します。Voidは `.env.example` を許可しないため、テンプレートファイルは置きません。

```ini
ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
ACCESS_CREATE_AUD=作成専用Accessアプリの64文字AUD
ACCESS_MCP_AUD=MCP専用Accessアプリの64文字AUD
```

teamはスキームやパスを含まないホスト名です。用途ごとに別のAUDを使用します。未構成・不正な設定は503、認証欠落やJWT不正は401、許可されていない本人は403です。ローカル認証バイパスはありません。通常のローカル起動で共有イベントを閲覧・回答できますが、新規作成とMCPにはAccess発行の有効なassertionが必要です。

## Cloudflareへデプロイ

Cloudflareアカウントへのログインと、Worker・D1を作成できる権限が必要です。

```sh
npx --no-install void cloudflare login
npx --no-install void cloudflare status
npm run build
npm run deploy
```

複数アカウントがある場合は目的のアカウントを選択してください。Voidが新規Worker・D1の作成、マイグレーション、アップロード、稼働確認を行います。初回公開時に出力されるURLと `void.lock.json` を確認し、lockファイルをGitに保管します。

本番の認証設定はVoidのserver envとして設定します。`.env` はアップロードされません。

```sh
npx --no-install void secret put ACCESS_TEAM_DOMAIN
npx --no-install void secret put ACCESS_CREATE_AUD
npx --no-install void secret put ACCESS_MCP_AUD
```

Cloudflare Accessで作成用とMCP用の2アプリ・本人限定ポリシーを構成し、MCP用でManaged OAuthを有効にします。旧固定MCPトークンは利用できません。Accessのopaque OAuth tokenをoriginでJWTとして扱わず、edgeが渡す `Cf-Access-Jwt-Assertion` のRS256署名・issuer・用途別AUD・期限・sub・emailを検証します。

スキーマ変更時は `db/schema.ts` を編集後、必ず以下を実行して生成SQLを確認します。

```sh
npx --no-install void db generate
npm run db:migrate:local
```

`db/migrations` の最初のmessagesテーブルはscaffolder由来で、次のマイグレーションで削除しています。削除許可はこの空の初期テーブルに限定されています。日程調整用テーブルは別の生成マイグレーションです。既存データのある環境で履歴を書き換えないでください。

## MCP接続

Codexで次を実行し、開いたブラウザで許可されたCloudflareアカウントへログインします。

```sh
codex mcp add awaseru --url https://awaseru.ts-create.workers.dev/mcp
codex mcp login awaseru
```

固定トークンの設定は不要です。OAuth成功後にCodexからtools/list・tool実行を確認します。この手順を記しただけでは実接続成功の証拠になりません。MCPサーバー本体はstateless Streamable HTTPで、認証後のGET / DELETEは405で終了し、購読には対応しません。

| ツール            | 用途             | 必要なキー・revision                                  |
| ----------------- | ---------------- | ----------------------------------------------------- |
| `create_poll`     | イベント作成     | クライアント生成adminKey、idempotencyKey              |
| `get_poll`        | 集計・状態取得   | イベントid                                            |
| `submit_response` | 回答追加         | クライアント生成editKey、idempotencyKey、pollRevision |
| `update_response` | 本人の回答編集   | editKey、回答revision、pollRevision                   |
| `set_poll_state`  | 締切・確定・再開 | adminKey、イベントrevision                            |

adminKey / editKeyは、クライアント側で32バイトの暗号学的乱数を生成してbase64url（43文字、パディングなし）にします。idempotencyKeyはUUIDです。秘密キーはサーバーにハッシュのみ保存され、レスポンスからは復元できません。再送時は同じ秘密キー・同じ内容・同じidempotencyKeyが必要で、異なる内容は409になります。成功済みの回答は、締切後に同一再送しても重複しません。

MCPのログインだけで他人の管理・編集はできません。管理にはイベントの管理キー、編集には本人の編集キーが別途必要です。AIから回答する前にも、共有URLを知る人に名前・回答・コメントが見えることを利用者に伝えてください。

## 保存・認可・競合

APIとMCPは `server/service.ts` の共通サービスを呼びます。Zodの同一スキーマで検証し、SQLパラメータへbindします。管理・編集キーをURLのfragmentに置き、管理・編集APIではAuthorization Bearerで送信します。ブラウザのlocalStorageには秘密キーだけを保存し、イベント・回答はD1へ保存します。storageが使えなくてもfragment URLで操作できます。

イベントの状態revisionと回答revisionは別です。回答追加はINSERT SELECT、回答編集はUPDATEの条件で親イベントのopen状態とrevisionを同時に確認します。状態変更は管理キー・イベントrevision・確定候補の所属を単一SQLで確認します。競合時は409になり、画面は入力を保持します。別画面で回答が更新された場合は最新回答を確認し、明示操作で最新revisionを採用して再送します。

作成・初回回答の応答が不明な場合は、前回の送信内容を保持して再確認します。確実に未保存だった状態競合では、入力を保持して最新状態を確認後に再送できます。ページを閉じる前に結果と秘密URLを確認してください。

## 確認コマンド

```sh
npm run typecheck
npm run fmt:check
npm run lint
npm test
npm run build
npm run test:integration
npm run secretlint
npm audit
```

`npm test` は実RSA署名fixtureによる認証境界と、マイグレーションを適用したSQLiteで拒否時のDB不変・公開回答・SDKの回帰を確認します。実Cloudflare署名・OAuthの代用にはしません。

`test:integration` は別ポート5197で実Worker/D1を起動し、設定未完了503・旧作成API410・公開案内・redirectを確認後、再起動して同じ検査を行います。通常の未構成状態では認証後の作成・MCP操作を実行せず、その旨を出力します。有効な実Access assertionを `ACCESS_CREATE_ASSERTION` / `ACCESS_MCP_ASSERTION` 環境変数で別々に渡した場合だけ、従来の作成・回答・管理・MCP操作・再起動後保存値比較も実行します。assertionはファイル・引数・ログに残さないでください。公開環境で実行すると合成データを作るため、対象を確認してください。

CIはlockfile固定・install scripts拒否・型・整形・lint・テスト・build・実通信・秘密検査を行います。OpengrepはCIのみで固定版とSHA-256を照合し、ローカルルールで通信を遮断して検査します。DependabotはnpmとGitHub Actionsを週次確認します。GitHub未接続の段階では、これらの設定ファイルが存在してもCI・botの実稼働は未確認です。

依存の安全更新としてzod・undici・esbuildへoverridesを適用しています。VoidやDrizzle CLIの互換性はビルド・型検査・マイグレーション生成と適用で確認します。依存更新後もこれらの検査を実行してください。

## 本人の日程調整一覧

`/` はログイン保護された `/create/polls` へ移動します。一覧APIは `GET /api/create/polls`、50件ずつ作成日時とIDの降順で返します。次ページはレスポンスの `nextCursor` を `cursor` クエリへ渡します。返す情報はID・タイトル・状態・回答人数・確定日時・作成日時のみです。

Web/MCP作成時には、署名・issuer・audience・期限・本人emailを検証したAccess JWTのissuer/subをhash化し、所有者として同時保存します。audienceは所有者hashに含めないため、同一issuer/subのWeb/MCPは同じ一覧になります。body・query・未検証ヘッダーで所有者を指定できません。

以前の日程は所有者NULLのまま保持し、本人ログイン後「管理リンクから追加」で正しい管理リンクを登録できます。別の所有者の帰属は上書きできません。これは一覧への追加のみであり、締切・確定・再開には従来どおり管理キーが必要です。別端末で一覧から開く場合も管理リンクを保管してください。所有者の自動推測や管理キー再発行は行いません。

## カレンダーで時間帯を追加・日程を削除

作成画面でカレンダーの日付を複数選び、開始・終了時刻を指定して一括追加できます。候補は同じ日の範囲で最大30件。カレンダー上の時間ラベルを押すと時刻の変更・削除ができます。MCPでは既存のslots（開始日時）に加え、同じ順・同じ件数のslotEnds（終了日時）を指定できます。slotEndsを省略した旧クライアント・既存イベントは開始時刻のみの互換動作です。

本人一覧のごみ箱から、イベント名を確認して削除できます。削除後は共有URLからの閲覧・回答・管理もできません。サーバーは検証済みログイン主体とrevisionを確認し論理削除します。管理リンクだけでは削除できません。作成者未設定の古い日程は、管理リンクで本人一覧へ追加してから削除します。復元UIはありません。
