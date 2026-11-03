import { defineHandler } from "void";
import { pollCalendar } from "../../../../server/calendar";
import { AppError } from "../../../../server/rules";
import { bearer } from "../../../../server/http";
import { SchedulingService } from "../../../../server/service";

export const GET = defineHandler(async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  try {
    const poll = await new SchedulingService(c.env.DB, c.get("ownerId")).calendarPoll(
      c.req.param("id")!,
      bearer(c),
    );
    const calendar = pollCalendar(poll, c.req.url);
    // IDs are UUIDs, but sanitize independently before putting any value in a response header.
    const filename = poll.id.replace(/[^a-zA-Z0-9-]/g, "");
    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="awaseru-${filename}.ics"`);
    return c.body(calendar);
  } catch (error) {
    if (error instanceof AppError)
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    console.error("Calendar export failed");
    return c.json({ error: "カレンダーを取得できませんでした。もう一度お試しください。" }, 500);
  }
});
