export const layout = "admin";
export default function Connect() {
  return (
    <main className="docs-page">
      <h1>MCP接続</h1>
      <p className="lead">同梱のMCPサーバーで、イベント作成から回答・日程確定まで操作できます。</p>
      <section>
        <h2>接続する</h2>
        <p>
          エンドポイントは、このサイトと同じホストの <code>/mcp</code> です。Streamable
          HTTPに対応したMCPクライアントを使用してください。
        </p>
        <pre>{`codex mcp add awaseru --url https://awaseru.ts-create.workers.dev/mcp
codex mcp login awaseru`}</pre>
        <p>
          ブラウザでCloudflareアカウントにログインします。利用できるのは、許可された本人のアカウントだけです。
        </p>
      </section>
      <section>
        <h2>使える操作</h2>
        <dl>
          <dt>create_poll</dt>
          <dd>イベントと候補日時を作成</dd>
          <dt>get_poll</dt>
          <dd>候補日時・回答・受付状態を取得</dd>
          <dt>submit_response</dt>
          <dd>全候補へ○△×を回答</dd>
          <dt>update_response</dt>
          <dd>本人の回答を更新</dd>
          <dt>set_poll_state</dt>
          <dd>締切・確定・再開</dd>
        </dl>
      </section>
      <section>
        <h2>秘密キーを保管する</h2>
        <p>
          ログインとは別に、管理操作にはイベントの管理キー、回答編集には本人の編集キーが必要です。作成・回答前に、クライアント側で32バイトの暗号学的乱数を生成し、base64url形式（43文字）で渡してください。
        </p>
        <p>
          再送時は同じ内容・秘密キー・idempotencyKeyを使います。更新時には、取得した最新のrevisionを指定してください。すべての日時は日本時間です。
        </p>
        <p className="privacy">
          共有IDを知る人は、参加者の名前・回答・コメントを閲覧できます。AIから回答する前にも、利用者へこの共有範囲を伝えてください。
        </p>
      </section>
      <a className="primary" href="/create">
        日程調整をつくる
      </a>
    </main>
  );
}
