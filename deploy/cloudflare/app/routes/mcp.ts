import { defineHandler } from "void";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { SchedulingService } from "../server/service";
import {
  AppError,
  createSchema,
  responseSchema,
  updateSchema,
  stateSchema,
  keySchema,
} from "../server/rules";
const handler = defineHandler(async (c) => {
  if (c.req.method !== "POST") {
    c.header("Allow", "POST");
    return c.json({ error: "このMCPサーバーはPOSTのみ対応しています。" }, 405);
  }
  const service = new SchedulingService(c.env.DB, c.get("ownerId")),
    server = new McpServer({ name: "awaseru", version: "1.0.0" });
  const output = async (fn: () => Promise<unknown>) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await fn()) }] };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: e instanceof AppError ? `${e.status}: ${e.message}` : "操作に失敗しました。",
          },
        ],
      };
    }
  };
  server.registerTool(
    "create_poll",
    {
      description:
        "候補日時(JST)で日程調整を作成。時間帯はslotsに開始、任意のslotEndsに同じ順の終了日時（同日で開始より後）を指定。adminKeyはクライアントで生成した32byte乱数のbase64url(43字)。必ず保管し再送も同一キー。共有URL所持者に名前/回答/コメントが見えることを利用者へ明示。戻り値のidから /p/id を共有。",
      inputSchema: createSchema,
    },
    (b) => output(() => service.create(b)),
  );
  server.registerTool(
    "get_poll",
    {
      description: "共有IDの日程調整と回答を取得。秘密情報は含まない。",
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    (b) => output(() => service.get(b.id)),
  );
  server.registerTool(
    "submit_response",
    {
      description:
        "全候補へyes/maybe/noで回答。editKeyはクライアント生成32byte乱数base64urlで本人が保管。名前/回答/コメントはURL所持者に公開。",
      inputSchema: responseSchema.extend({ id: z.string().uuid() }),
    },
    ({ id, ...b }) => output(() => service.submit(id, b)),
  );
  server.registerTool(
    "update_response",
    {
      description: "本人のeditKeyで回答編集。取得した最新の回答revisionとpollRevisionが必要。",
      inputSchema: updateSchema.extend({
        id: z.string().uuid(),
        responseId: z.string().uuid(),
        editKey: keySchema,
      }),
    },
    ({ id, responseId, editKey, ...b }) => output(() => service.update(id, responseId, b, editKey)),
  );
  server.registerTool(
    "set_poll_state",
    {
      description:
        "管理キーで締切closed・確定finalized・再開open。最新event revision必須。確定時はそのイベントのselectedSlot必須。",
      inputSchema: stateSchema.extend({ id: z.string().uuid(), adminKey: keySchema }),
    },
    ({ id, adminKey, ...b }) => output(() => service.state(id, b, adminKey)),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 32768,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
