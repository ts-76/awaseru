import { defineHandler } from "void";
import { calendarLinkResponse } from "../../../../server/calendar-handler";
export const GET = defineHandler((c) => calendarLinkResponse(c));
