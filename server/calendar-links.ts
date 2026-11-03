import type { PublicPoll } from "./service";

/** Prefilled editors only: constructing a link never writes to a calendar. */
export function calendarLinks(poll: PublicPoll, requestUrl: string) {
  const index = poll.selectedSlot ? poll.slots.indexOf(poll.selectedSlot) : -1;
  if (poll.status !== "finalized" || index < 0 || !poll.selectedSlot) return null;
  const start = new Date(poll.selectedSlot);
  if (!Number.isFinite(start.getTime())) return null;
  const endValue = poll.slotEnds?.[index];
  const end = endValue ? new Date(endValue) : null;
  if (end && (!Number.isFinite(end.getTime()) || end <= start)) return null;
  const ics = `/api/polls/${encodeURIComponent(poll.id)}/calendar`;
  if (!end) return { ics, providers: [] };
  let origin: string;
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ics, providers: [] };
    origin = url.origin;
  } catch {
    return { ics, providers: [] };
  }
  const share = new URL(`/p/${encodeURIComponent(poll.id)}`, origin).href;
  const body = [poll.description, share].filter(Boolean).join("\n\n");
  const compact = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const google = new URL("https://calendar.google.com/calendar/r/eventedit");
  google.search = new URLSearchParams({
    action: "TEMPLATE",
    text: poll.title,
    details: body,
    dates: `${compact(start)}/${compact(end)}`,
    stz: "Asia/Tokyo",
    etz: "Asia/Tokyo",
  }).toString();
  const outlook = (host: string) => {
    const url = new URL(`https://${host}/calendar/deeplink/compose`);
    url.search = new URLSearchParams({
      subject: poll.title,
      startdt: start.toISOString(),
      enddt: end.toISOString(),
      body,
    }).toString();
    return url.href;
  };
  return {
    ics,
    providers: [
      { label: "Google カレンダー", href: google.href },
      { label: "Outlook（個人用）", href: outlook("outlook.live.com") },
      { label: "Microsoft 365", href: outlook("outlook.office.com") },
    ],
  };
}
