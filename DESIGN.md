---
name: scheduling
description: ぶどう紫を軸に、みんなの予定を気持ちよく合わせる。
colors:
  canvas: "#f2f2f7"
  base: "#ffffff"
  surface: "#f4f4f6"
  hairline: "#ececf0"
  scrollbar: "#c6c5cc"
  border: "#8e8d96"
  text: "#18181b"
  text-muted: "#5f5e66"
  main: "#5a3fd6"
  on-main: "#ffffff"
  accent: "#e8590c"
  on-accent: "#16151b"
  success-surface: "#dcf3e0"
  success-border: "#a0d2a9"
  success: "#057c38"
  warning-surface: "#f8ead2"
  warning-border: "#ddbe8a"
  warning: "#8a6202"
  danger-surface: "#ffe5e1"
  danger-border: "#f1b0a8"
  danger: "#b0463e"
  info-surface: "#deeeff"
  info-border: "#9dc7f4"
  info: "#136db7"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic UI, Meiryo, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic UI, Meiryo, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic UI, Meiryo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, Yu Gothic UI, Meiryo, sans-serif"
    fontSize: "14px"
    fontWeight: 600
rounded:
  badge: "6px"
  control: "8px"
  segment: "11px"
  card: "16px"
  panel: "12px"
spacing:
  compact: "8px"
  inline: "16px"
  field: "24px"
  panel: "32px"
components:
  button-primary:
    backgroundColor: "{colors.main}"
    textColor: "{colors.on-main}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.on-main}"
    textColor: "{colors.main}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
  input:
    backgroundColor: "{colors.base}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
  panel:
    backgroundColor: "{colors.on-main}"
    rounded: "{rounded.panel}"
    padding: "32px"
  status-open:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.badge}"
    padding: "2px 10px"
  highlight:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.badge}"
    padding: "1px 6px"
  answer-track:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.segment}"
    padding: "3px"
  answer-selected:
    backgroundColor: "{colors.base}"
    textColor: "{colors.main}"
    rounded: "{rounded.control}"
    height: "44px"
    width: "48px"
---

# Design System: scheduling

## Overview

ぶどう紫を軸にした、親しみやすく整った日本語日程調整ツール。親しみはロゴ、紫の主操作、太字の見出しで出し、色数・角丸・影は控えて質感を保つ。見出し、入力ラベル、並び順、列の整列で次の操作を伝える。通常利用画面に紹介文・使い方・恒常的な補足段落は置かない。利用者が入力した説明とコメント、エラー・成功・競合のフィードバックは業務情報として表示する。

## Colors

frontmatterが色の正本。ぶどう紫（main）は主操作・選択・リンク・ロゴだけ。みかん橙（accent）は集計表の「最多」1か所だけに塗りで使う。回答人数・確定日のラベル・数値は中立色または状態色。地はcanvas #f2f2f7、内容は白いカード（Layered Surfaces参照）。枠線は入力だけで、区切りは層の差と余白で示す。参加リンク・公開範囲・コード例・表見出しはsurface（中立のごく薄い灰）。mainを混ぜた面（main-tint）は選択中の○△×とhoverだけ。△の記号はwarning。影は中立色の柔らかいものを、カード・ダイアログ・主ボタン・選択中のセグメントにだけ使う。色付きの影とグラデーションは使わない。

### Named Rules

**The Quiet Status Rule.** 状態は角丸6pxの小さなバッジ（薄い面・太字ラベル、枠・点なし）で示す。受付中はsuccess、締切はneutral、日程確定はwarning。

**The One Fill Rule.** ぶどう紫の塗りは主操作とロゴの角丸四角だけ。選択中の○△×は紫の枠と文字＋main-tintの面。

**The Single Accent Rule.** みかん橙は「最多」の印1か所だけ。

**The Three Radii Rule.** 角丸はバッジ6px、ボタン・入力・○△×・通知8px、パネル・表12pxの3段だけ。ピル型・円形は使わない。

**The Layout First Rule.** 操作説明を追加する前に、ラベル・グループ・列見出し・公開範囲の定義リストで意味を伝える。

## Typography

OS標準の和文書体（Apple端末はヒラギノ、それ以外はNoto Sans JP・Yu Gothic UI・メイリオの順）。外部フォントは読み込まない。見出し・ロゴは700、ラベル・ボタン・ナビ・状態ラベルは600。字間はサイズ別：見出しは-0.02em、本文は0、12px以下の補足・状態ラベル・列見出しは+0.02em。本文16px、ラベル14px、補助的な単位やメタデータ12px。作成見出しは28px、小画面24px。日程画面のタイトルは32px、小画面26px。接続案内は36px、小画面26px。入力欄は小画面16px。数値は等幅数字。

## Layout

作成画面は最大720px・左右24pxの単一カラム。白いカード（角丸16px・内側余白32px、小画面22px/18px）の中に、ページ見出しからイベント名、折り畳みの説明、候補日時、公開範囲、送信へ縦に並ぶ。パネルの入れ子、ヒーロー、紹介段落、手順表示は置かない。

日程画面の最大幅1148px、ヘッダー1220px（高88px）、接続案内760px。集計の下に回答欄と主催者欄（320px・間隔48px、どちらも白いパネル）。800px以下は1列で左右16px、ヘッダー高64px。作成画面見出し下28px、項目間20px、候補行間10px。日時のJSTと候補件数はlegend内のメタデータ。

集計表は縦線と外枠を使わず、行ごとの細線で整列させる。小画面で候補列124px・参加者列108px。枠内で横スクロールし、参加者列を左に固定する。共有URLと「コピー」ボタンは1行。参加リンクと管理リンクは用途のラベルで分ける。保存後の回答編集リンクは「回答編集リンク（本人用）」の見出しで区別する。

## Components

### Inputs

見えるラベルとnative requiredを使う。必須・任意の注記を反復せず、任意の説明・コメントはdetailsへ置く。閉じても入力値は保持する。入力欄は角丸8px、小画面の文字16px。

### Answer Choices

各候補の○△×は1つのセグメントコントロール（surfaceの溝・内側3px・角丸11px、各項目は48×44px、小画面44×44px）。○△×はOSの書体に頼らず、線幅2pxのSVGで描く（表の回答も同じ部品、読み上げ用の文字を添える）。同じ列の上に「参加」「調整」「不可」を溝の内側に揃える。未選択は透明で記号はtext-muted、hoverで記号が紫。選択した項目は白く浮き（影0 1px 2px／0 1px 1px、寸法は変えない）、記号は紫・線幅2.4px、aria-pressedで示す。押した瞬間にscale(0.94)。ARIAラベルには日時と回答の意味を含める。空の集計も0人と表で表現する。

### Visibility

送信前の定義リストに「回答の公開範囲：リンクを知っている人」「公開される情報：説明・名前・回答・コメント」を、余白で分けた項目と値で表示する。説明段落ではなく項目と値の組として置き、公開判断に必要な情報を保つ。

### Actions and Feedback

主操作はぶどう紫の塗り・角丸8px・太字、影なし、hoverで少し暗く。補助操作は薄紫面・枠なし・紫文字・角丸8px、hoverでmain-tint。最小高48px、細かい操作も44px（例外：カレンダー内の時間ラベルは高さ28px、タッチ端末では36px・日付間4px。1日に多数並ぶため、WCAG 2.5.8の24pxは満たしつつ一覧性を優先）。管理リンクは「主催者専用」と表示。主催者欄は日時選択、日程確定、締切、受付再開の順。受付不可は状態ラベル、確定日はラベルと日時で表示する。成功通知はstatus、エラーはalert。競合時の判断情報は動的フィードバックとして残す。

### Navigation and Documentation

ヘッダーは全画面で1つ。上部に固定した半透明の素材（白72%・blur 20px・saturate 180%）で、本文が下を流れる。下端の細線はスクロールして内容が下に入った時だけ現れる（scroll()タイムライン非対応のブラウザでは常時）。透明度を減らす設定では不透明の白、コントラストを上げる設定では不透明＋濃い細線。ロゴはぶどう紫の角丸四角に白いカレンダー記号と、700の「awaseru」。公開画面（日程画面 `/p/[id]`）ではロゴはリンクにせず、ナビ・ログイン・MCP接続への導線を一切置かない。Access保護下の管理画面（`/create`、`/create/polls`、`/create/connect`）だけが名前付きレイアウト `admin` でロゴを本人一覧へのリンクにし、`nav aria-label="メイン"` に一覧・新規作成・MCP接続の3リンク（角丸8px、hoverでmain-tint）を置く。旧 `/connect` は `/create/connect` へ302。小画面で収まらない場合はナビを次の行へ折り返す。小画面の各リンクは高44px以上。日程画面の「回答する」は回答欄へのページ内リンク。宣伝フッターは置かない。MCP接続案内は説明を読むページのため、本文・手順を保持する。

### Motion and Accessibility

ボタン・リンクボタン・ナビ・一覧行の状態変化は150ms ease-out（cubic-bezier(0.23, 1, 0.32, 1)）、押下の反応は押した瞬間に100msでscale 0.97（○△×は0.94）。コピーはボタン自体が「✓ コピー済み」（success色）に変わり1.8秒で戻る。ボタン幅は変わらない。reduced-motionでtransitionと押下の縮小を解除。マウスhoverはhover:hover/pointer:fineのみ。フォーカス3pxのぶどう紫、offset4px。選択範囲はmainの薄い色、キャレットはmain、スクロールバーはborder/base。

### Layered Surfaces

地はcanvas #f2f2f7（iOSのgrouped背景、冷たい中立の灰）。参加リンク・回答一覧・回答欄・主催者欄・作成フォーム・本人一覧・管理リンクから追加・接続案内の各節は白いカード（角丸16px、影 0 1px 2px 5% ＋ 0 8px 24px -12px 14%、いずれも本文色ベースの中立色）。カードの入れ子はしない。カード内の溝・公開範囲・表見出しはsurface #f4f4f6。主ボタンは中立の影と上端の光（inset 0 1px 0 白14%）。モバイルの「回答を送信する」は画面下端に浮いて付いてくる（安全領域込み、焦点の欄はscroll-padding-bottomで隠さない）。コントラストを上げる設定ではカードの影を1pxの縁に置き換える。ヘッダーはcanvas 72%のすりガラス。管理者がログイン中は、公開画面でも読み込み後に一覧・新規作成・MCP接続のナビを出す（本人確認できた時だけ、別チャンクで読み込む）。管理画面のナビは今いるページを薄紫の面で示す。

## Do's and Don'ts

- Do: 操作と業務データの優先順を揃える。ラベルと入力の関係を見える形で保つ。
- Do: 公開範囲、状態、失敗、競合の判断情報を残す。
- Do: 紫の主操作・ロゴ・太字の見出しで親しみやすさを出し、角丸は3段に抑える。
- Don't: 常設の使い方段落、紹介文、カードの入れ子を追加しない。
- Don't: ボタンに影を付けない。色付きの影、ピル型・円形、グラデーションを使わない。
- Don't: みかん橙を「最多」以外に使わない。mainを混ぜた面を情報の背景に使わない。
- Don't: 小さな文字への縮小で収めない。

### My Polls

本人一覧は最大900px。見出し「作成した日程調整」と新規作成を横に置き、イベントは白地に細線で区切った行に並べる（行ごとのカードにしない）。hoverとフォーカスで操作欄を含む行全体がsurfaceになる。詳細・締切／再開・削除は独立した操作対象とし、詳細へのhoverとフォーカスはタイトルも紫にする。行内の締切／再開ボタンは通常は透明地の紫文字、hover時だけmain-tintにする。空の状態はsurfaceの枠なし面に短いラベル。タイトルと受付状態、回答人数と確定日時をグループ化する。800px以下は各行の下段にメタデータを移し、右端の矢印と行全体が詳細へのリンクになる。長いタイトルは省略せず折り返す。旧日程の追加は「管理リンクから追加」の折り畳みへ置く。初回読込・空・失敗・再読込・次ページ・成功を短い状態ラベルで表示し、補足段落は置かない。

## Smart UI feedback

参加リンクは詳細ページで常に確認・コピー可能。管理リンクは管理キー所持者だけに表示。回答保存成功は送信位置で「回答しました」と本人用編集リンクを示す。日程確定・締切は対象日時またはイベント名を含む二度押し確認（4秒で解除）。入力変更は確認を解除し、保存中は日時選択を無効にする。

## Calendar candidates and deletion

作成画面の候補日時は7列の月カレンダーと共通の開始・終了時刻、選択日への追加ボタンを一続きに置く。日付のマスは日付ボタン（一括追加の選択、紫の塗りとaria-pressed、今日は下線）と、その日の候補を開始時刻順に並べた時間ラベルからなる。ラベルはmain-tint-strongの面に紫の600の文字「10:00–11:00」、角丸6px。範囲が日のマスに収まらない時は終了時刻を2行目へ回し、省略記号で切らない。カレンダー幅559px以下では開始時刻だけを表示し、読み上げ名には日付と開始〜終了を含める。表示中以外の月の候補は「ほかの月の候補　12月 1件」の文字ボタンで示し、押すとその月へ移る。ラベルを押すと<dialog>（bodyへportal、作成フォームの外）が開き、見出し「11月7日(土)の候補」、開始・終了の時刻、エラー、「この候補を削除」（左・danger文字）／キャンセル／保存。同じ日付のまま、終了は開始より後、開始日時の重複は不可。Escape・キャンセルは変更なし。閉じたら押したラベルへ、削除後はその日の日付ボタンへフォーカスを戻す。ダイアログは削除確認と同じく角丸16px・中立の影。月を移動しても選択は保持し、追加後に選択を解除する。追加結果と重複除外・上限エラーを短い動的通知で示す。

本人一覧の削除は行リンクとは別の44pxごみ箱SVG。イベント名を含む名前付きnative dialogで、共有URLの閲覧・回答も停止すると告知する。キャンセルと赤い削除するボタンを離し、保存中は二重操作を防ぐ。失敗では行を保持し、最新一覧の再取得へ戻れる。公開画面に削除導線は置かない。
