import type { CloudContext } from "void";
import { calendarLinks } from "./calendar-links";
import { bearer, execute } from "./http";
import { AppError } from "./rules";
export function calendarLinkResponse(c: CloudContext, ownerRoute = false) {
  c.header("Cache-Control", "no-store");
  return execute(c, async (s) => {
    const poll = await s.calendarPoll(c.req.param("id")!, ownerRoute ? undefined : bearer(c));
    const links = calendarLinks(poll, c.req.url);
    if (!links) throw new AppError(409, "日程が確定していません。日程を再読み込みしてください。");
    return {
      ...links,
      ics: ownerRoute ? `/api/create/polls/${encodeURIComponent(poll.id)}/calendar` : links.ics,
    };
  });
}
