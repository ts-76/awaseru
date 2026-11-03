import { z } from "zod";
import { MAX_SLOTS } from "./limits";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export const keySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "32バイトの秘密キーが必要です。");
export const requestKey = z.string().uuid();
export const revisionSchema = z.number().int().min(0);
const slot = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/)
  .refine((v) => {
    const d = new Date(v);
    return (
      !Number.isNaN(d.getTime()) &&
      new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 19) === v.slice(0, 19)
    );
  }, "候補日時を確認してください。");
export const createSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).default(""),
    slots: z
      .array(slot)
      .min(1)
      .max(MAX_SLOTS)
      .refine((v) => new Set(v).size === v.length, "候補日時が重複しています。"),
    slotEnds: z.array(slot).min(1).max(MAX_SLOTS).optional(),
    adminKey: keySchema,
    idempotencyKey: requestKey,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.slotEnds &&
      (v.slotEnds.length !== v.slots.length ||
        v.slotEnds.some(
          (end, i) =>
            !v.slots[i] || end.slice(0, 10) !== v.slots[i].slice(0, 10) || end <= v.slots[i],
        ))
    )
      ctx.addIssue({ code: "custom", message: "終了日時は同じ日の開始日時より後にしてください。" });
  });
export const ownerStateSchema = z
  .object({ status: z.enum(["open", "closed"]), revision: revisionSchema })
  .strict();
export const deleteSchema = z.object({ revision: revisionSchema }).strict();
export const responseFields = {
  name: z.string().trim().min(1).max(40),
  comment: z.string().trim().max(200).default(""),
  answers: z
    .array(z.enum(["yes", "maybe", "no"]))
    .min(1)
    .max(MAX_SLOTS),
  pollRevision: revisionSchema,
};
export const responseSchema = z
  .object({ ...responseFields, editKey: keySchema, idempotencyKey: requestKey })
  .strict();
export const updateSchema = z.object({ ...responseFields, revision: revisionSchema }).strict();
export const stateSchema = z
  .object({
    status: z.enum(["open", "closed", "finalized"]),
    selectedSlot: z.string().optional(),
    revision: revisionSchema,
  })
  .strict();
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function sameSecret(a: string, b: string) {
  const x = await hash(a),
    y = await hash(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(422, result.error.issues.map((i) => i.message).join(" / "));
  return result.data;
}

export const claimSchema = z.object({ id: z.string().uuid(), adminKey: keySchema }).strict();
export const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const listCursorSchema = z
  .object({ createdAt: z.string().datetime(), id: z.string().uuid() })
  .strict();
