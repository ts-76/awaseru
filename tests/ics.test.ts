import { describe, expect, it } from "vitest";
import { pollCalendar } from "../server/calendar";
import type { PublicPoll } from "../server/service";
const poll: PublicPoll = {
  id: "e665c046-5ef4-4ac6-aef3-b2b464e6a991",
  title: "打合せ",
  description: "場所は説明のまま",
  slots: ["2027-01-01T00:30:00+09:00", "2027-01-02T10:00:00+09:00"],
  slotEnds: ["2027-01-01T01:30:00+09:00", "2027-01-02T12:00:00+09:00"],
  status: "finalized",
  selectedSlot: "2027-01-01T00:30:00+09:00",
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
const output = (data = poll) =>
  pollCalendar(
    data,
    "https://example.com/api/polls/id/calendar?admin=secret#edit=secret",
    new Date("2026-11-03T01:02:03.456Z"),
  );
const unfold = (value: string) => value.replace(/\r\n /g, "");
describe("確定日程のICS", () => {
  it("JST年境界をUTCへ変換し選択候補と対応する終了だけを出す", () => {
    const value = unfold(output());
    expect(value).toContain("DTSTART:20261231T153000Z\r\nDTEND:20261231T163000Z");
    expect(value).toContain("DTSTAMP:20261103T010203Z");
    expect(value).toContain(`UID:${poll.id}@awaseru`);
    expect(value).toContain(`URL:https://example.com/p/${poll.id}\r\n`);
    expect(value).toContain(`DESCRIPTION:場所は説明のまま\\n\\nhttps://example.com/p/${poll.id}`);
    expect(value).not.toMatch(/secret|PRIVATE|response-secret|LOCATION|ATTENDEE|ORGANIZER|METHOD:/);
    expect(value.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(value.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const second = unfold(output({ ...poll, selectedSlot: poll.slots[1] }));
    expect(second).toContain("DTEND:20270102T030000Z");
  });
  it("改行注入とTEXT記号をエスケープし、UTF8文字を壊さず75octetに折る", () => {
    const title = "あ😀".repeat(80) + "\\,;\r\nATTENDEE:evil\rX-Test:bad\nEND:VEVENT";
    const value = output({ ...poll, title });
    for (const line of value.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(value).not.toContain("�");
    const logical = unfold(value);
    expect(logical).toContain("\\\\\\,\\;\\nATTENDEE:evil\\nX-Test:bad\\nEND:VEVENT");
    expect(logical.split("\r\n").filter((line) => line === "END:VEVENT")).toHaveLength(1);
    expect(logical).not.toMatch(/\r\nATTENDEE:/);
  });
  it("旧開始のみ候補に終了や時間を補わない", () => {
    expect(output({ ...poll, slotEnds: undefined })).not.toMatch(/DTEND|DURATION/);
  });
  it("TEXTで使えない制御文字を除きタブは保持", () => {
    const value = output({ ...poll, title: "会\u0000議\u0007\u001f\u007f\t予定" });
    expect(value).toContain("SUMMARY:会議\t予定\r\n");
    for (const code of [0, 7, 31, 127]) expect(value).not.toContain(String.fromCharCode(code));
  });
  it("未確定、選択候補不一致、壊れた日時を拒否", () => {
    for (const patch of [
      { status: "open" },
      { status: "closed" },
      { status: "deleted" },
      { selectedSlot: null },
      { selectedSlot: "2028-01-01T00:00:00Z" },
      { slotEnds: ["invalid"] },
      { slotEnds: [poll.slots[0]] },
    ])
      expect(() => output({ ...poll, ...patch })).toThrow();
  });
});
