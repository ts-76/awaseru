import { AppError } from "./rules";
import type { PublicPoll } from "./service";

function timestamp(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new AppError(409, "確定日時を確認できません。日程を再読み込みしてください。");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
function text(value: string) {
  return (
    value
      // RFC 5545 TEXT permits TAB but excludes the other ASCII control characters.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
  );
}
// RFC 5545 limits physical content lines to 75 UTF-8 octets, including continuation space.
function fold(line: string) {
  let result = "",
    length = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (length + size > 75) {
      result += "\r\n ";
      length = 1;
    }
    result += char;
    length += size;
  }
  return result;
}

export function pollCalendar(poll: PublicPoll, requestUrl: string, now = new Date()) {
  const index = poll.selectedSlot ? poll.slots.indexOf(poll.selectedSlot) : -1;
  if (poll.status !== "finalized" || index < 0 || !poll.selectedSlot)
    throw new AppError(409, "日程が確定していません。日程を再読み込みしてください。");
  const start = timestamp(poll.selectedSlot),
    end = poll.slotEnds?.[index];
  if (end && new Date(end).getTime() <= new Date(poll.selectedSlot).getTime())
    throw new AppError(409, "確定日時を確認できません。日程を再読み込みしてください。");
  const url = new URL(`/p/${encodeURIComponent(poll.id)}`, requestUrl).href;
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//awaseru//Calendar Export//JA",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${text(poll.id)}@awaseru`,
      `DTSTAMP:${timestamp(now)}`,
      `DTSTART:${start}`,
      ...(end ? [`DTEND:${timestamp(end)}`] : []),
      `SUMMARY:${text(poll.title)}`,
      `DESCRIPTION:${text([poll.description, url].filter(Boolean).join("\n\n"))}`,
      `URL:${url}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
