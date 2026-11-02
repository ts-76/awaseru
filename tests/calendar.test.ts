import { describe, it, expect } from "vitest";
import {
  addCandidates,
  candidatesByDate,
  dayLabel,
  jstToday,
  monthDays,
  otherMonths,
  updateCandidate,
} from "../pages/_candidate-picker";
import { dateLabel } from "../pages/_ui";
describe("カレンダー一括候補", () => {
  it("今日の日付は日本時間の日付境界で切り替わる", () => {
    expect(jstToday(Date.parse("2026-10-31T14:59:59Z"))).toBe("2026-10-31");
    expect(jstToday(Date.parse("2026-10-31T15:00:00Z"))).toBe("2026-11-01");
    expect(jstToday(Date.parse("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    expect(jstToday(Date.parse("2028-02-28T15:00:00Z"))).toBe("2028-02-29");
  });
  it("閏日・月末・曜日位置を実際の日付に一致させる", () => {
    expect(monthDays("2028-02").filter(Boolean)).toHaveLength(29);
    expect(monthDays("2026-02").filter(Boolean)).toHaveLength(28);
    expect(monthDays("2026-04").filter(Boolean).at(-1)).toBe("2026-04-30");
    expect(monthDays("2026-11")[0]).toBe("2026-11-01");
  });
  it("月をまたぐ複数日を同じ範囲へ、重複開始は増やさない", () => {
    const first = addCandidates([], ["2026-12-31", "2027-01-01"], "19:00", "21:00");
    expect(first.count).toBe(2);
    expect(first.items[1]).toEqual({ start: "2027-01-01T19:00", end: "2027-01-01T21:00" });
    expect(addCandidates(first.items, ["2026-12-31"], "19:00", "22:00")).toEqual({
      items: first.items,
      count: 0,
    });
    expect(dateLabel("2027-01-01T19:00:00+09:00", "2027-01-01T21:00:00+09:00")).toContain(
      "19:00〜21:00",
    );
  });
  it("30件超と逆時間で元入力を変えない", () => {
    const values = Array.from({ length: 30 }, (_, i) => ({
      start: `2026-11-${String(i + 1).padStart(2, "0")}T19:00`,
      end: `2026-11-${String(i + 1).padStart(2, "0")}T21:00`,
    }));
    const before = JSON.stringify(values);
    expect(() => addCandidates(values, ["2026-12-01"], "19:00", "21:00")).toThrow("30件");
    expect(() => addCandidates(values, ["2026-12-01"], "21:00", "19:00")).toThrow();
    expect(() => addCandidates([], ["2026-02-30"], "19:00", "21:00")).toThrow();
    expect(() => addCandidates([], ["2026-12-01"], "19:00", "99:99")).toThrow();
    expect(JSON.stringify(values)).toBe(before);
    expect(addCandidates(values, ["2026-11-01"], "19:00", "21:00").count).toBe(0);
  });
});

describe("カレンダー内の候補ラベルと時間変更", () => {
  const value = [
    { start: "2026-11-07T13:00", end: "2026-11-07T14:00" },
    { start: "2026-11-03T10:00", end: "2026-11-03T11:00" },
    { start: "2026-11-07T10:00", end: "2026-11-07T11:00" },
    { start: "2026-12-01T19:00", end: "2026-12-01T21:00" },
  ];
  it("日付ごとに開始時刻順でまとめ、元の位置を保つ", () => {
    const days = candidatesByDate(value);
    expect(days.get("2026-11-07")).toEqual([
      { index: 2, start: "10:00", end: "11:00" },
      { index: 0, start: "13:00", end: "14:00" },
    ]);
    expect(days.get("2026-11-03")).toEqual([{ index: 1, start: "10:00", end: "11:00" }]);
  });
  it("表示中以外の月の件数を月順に返す", () => {
    expect(otherMonths(value, "2026-11")).toEqual([{ month: "2026-12", count: 1 }]);
    expect(otherMonths(value, "2026-10")).toEqual([
      { month: "2026-11", count: 3 },
      { month: "2026-12", count: 1 },
    ]);
  });
  it("同じ日付のまま開始・終了を変更し、他の候補は変えない", () => {
    const next = updateCandidate(value, 1, "09:30", "12:00");
    expect(next[1]).toEqual({ start: "2026-11-03T09:30", end: "2026-11-03T12:00" });
    expect(next.filter((_, i) => i !== 1)).toEqual(value.filter((_, i) => i !== 1));
  });
  it("終了が開始以前・開始日時の重複・不正な時刻は保存しない", () => {
    expect(() => updateCandidate(value, 1, "11:00", "11:00")).toThrow("終了は開始より後");
    expect(() => updateCandidate(value, 1, "12:00", "11:00")).toThrow("終了は開始より後");
    expect(() => updateCandidate(value, 0, "10:00", "12:00")).toThrow("同じ開始日時");
    expect(() => updateCandidate(value, 0, "", "12:00")).toThrow("時刻を入力");
    expect(() => updateCandidate(value, 9, "10:00", "11:00")).toThrow("候補が見つかりません");
  });
  it("自分自身の開始時刻のままなら重複扱いしない", () => {
    expect(updateCandidate(value, 0, "13:00", "15:00")[0].end).toBe("2026-11-07T15:00");
  });
  it("日付ラベルは曜日付き", () => {
    expect(dayLabel("2026-11-03")).toBe("11月3日(火)");
    expect(dayLabel("2026-11-08")).toBe("11月8日(日)");
  });
});
