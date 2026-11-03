import { describe, expect, it } from "vitest";
import { calendarLinks } from "../server/calendar-links";
import type { PublicPoll } from "../server/service";
const poll: PublicPoll = {
  id: "public-id",
  title: "年末会議 & + #? 日本語",
  description: "説明\n場所: A&B + café? #集合",
  slots: ["2027-01-02T10:00:00+09:00", "2027-01-01T00:30:00+09:00"],
  slotEnds: ["2027-01-02T12:00:00+09:00", "2027-01-01T01:30:00+09:00"],
  selectedSlot: "2027-01-01T00:30:00+09:00",
  status: "finalized",
  revision: 1,
  createdAt: "2026-10-01T00:00:00Z",
  responses: [
    {
      id: "response-secret",
      name: "PRIVATE NAME",
      comment: "PRIVATE COMMENT",
      answers: ["yes"],
      revision: 0,
    },
  ],
};
const links = (
  patch: Partial<PublicPoll> = {},
  url = "https://user:password@example.com/p/other?admin=SECRET#response=SECRET&edit=SECRET",
) => calendarLinks({ ...poll, ...patch }, url);
describe("カレンダーの入力済み作成リンク", () => {
  it("日本語・特殊文字・改行を保持し、選択候補の終了と年境界をUTCへ変換する", () => {
    const value = links()!;
    expect(value.providers.map((p) => p.label)).toEqual([
      "Google カレンダー",
      "Outlook（個人用）",
      "Microsoft 365",
    ]);
    const google = new URL(value.providers[0].href);
    expect(google.origin + google.pathname).toBe(
      "https://calendar.google.com/calendar/r/eventedit",
    );
    expect(Object.fromEntries(google.searchParams)).toEqual({
      action: "TEMPLATE",
      text: poll.title,
      details: poll.description + "\n\nhttps://example.com/p/public-id",
      dates: "20261231T153000Z/20261231T163000Z",
      stz: "Asia/Tokyo",
      etz: "Asia/Tokyo",
    });
    for (const [index, host] of [
      [1, "outlook.live.com"],
      [2, "outlook.office.com"],
    ] as const) {
      const url = new URL(value.providers[index].href);
      expect(url.host).toBe(host);
      expect(url.pathname).toBe("/calendar/deeplink/compose");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        subject: poll.title,
        startdt: "2026-12-31T15:30:00.000Z",
        enddt: "2026-12-31T16:30:00.000Z",
        body: poll.description + "\n\nhttps://example.com/p/public-id",
      });
    }
    expect(JSON.stringify(value)).not.toMatch(
      /SECRET|PRIVATE|response-secret|password|user:|admin=|edit=/,
    );
    expect(value.ics).toBe("/api/polls/public-id/calendar");
  });
  it("未確定・不一致・不正な開始終了・逆転や同時刻にはリンクを作らない", () => {
    for (const patch of [
      { status: "open" },
      { status: "closed" },
      { status: "deleted" },
      { selectedSlot: null },
      { selectedSlot: "missing" },
      { slots: ["invalid"], selectedSlot: "invalid" },
      { slotEnds: [poll.slotEnds![0], "invalid"] },
      { slotEnds: [poll.slotEnds![0], poll.selectedSlot!] },
      { slotEnds: [poll.slotEnds![0], "2026-12-01T00:00:00Z"] },
    ])
      expect(links(patch)).toBeNull();
  });
  it("旧開始のみ候補と未確定originではICSだけを提供する", () => {
    expect(links({ slotEnds: undefined })).toEqual({
      ics: "/api/polls/public-id/calendar",
      providers: [],
    });
    expect(links({}, "")).toEqual({ ics: "/api/polls/public-id/calendar", providers: [] });
    expect(links({}, "javascript:alert(1)")!.providers).toEqual([]);
  });
  it("空の説明にも公開URLだけを渡しパスの特殊文字をエンコードする", () => {
    const value = links({ id: "id?#/", description: "" })!;
    expect(new URL(value.providers[0].href).searchParams.get("details")).toBe(
      "https://example.com/p/id%3F%23%2F",
    );
    expect(value.ics).toBe("/api/polls/id%3F%23%2F/calendar");
  });
});
