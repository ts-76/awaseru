import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../pages/_ui";
import { ownerSession } from "../pages/_public-header";
afterEach(() => vi.unstubAllGlobals());
describe("API通信失敗の回復案内", () => {
  it("作成fetch例外を短い日本語と再ログイン識別子へ変換し再送payloadを保持", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json({ id: "saved" }));
    vi.stubGlobal("fetch", fetch);
    const snapshot = {
      title: "入力保持",
      slots: ["2026-11-01T12:00:00+09:00"],
      adminKey: "same-secret",
      idempotencyKey: "same-request",
    };
    await expect(api("/api/create", "POST", snapshot)).rejects.toMatchObject({
      code: "auth_or_network",
      message: "認証または通信を確認できません。別のタブでログインしてから再送してください。",
    });
    await expect(api("/api/create", "POST", snapshot)).resolves.toEqual({ id: "saved" });
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(snapshot.title).toBe("入力保持");
  });
  it("作成のAccess HTML応答も再ログイン対象", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Login</html>", { status: 200 })),
    );
    await expect(api("/api/create", "POST", {})).rejects.toMatchObject({
      code: "auth_or_network",
      status: 200,
    });
  });
  it("公開回答のfetch例外とHTML応答には作成ログインを案内しない", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("<html>failure</html>", { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    for (let i = 0; i < 2; i++)
      await expect(api("/api/polls/id/responses", "POST", {})).rejects.toMatchObject({
        code: "network_error",
        message: "通信を確認できません。入力を保持して、もう一度お試しください。",
      });
  });
});

describe("公開画面の本人ログイン判定", () => {
  it("Accessを通過した200 {signedIn:true} だけを本人とする", async () => {
    const ok = vi.fn().mockResolvedValue(Response.json({ signedIn: true }));
    expect(await ownerSession(ok)).toBe(true);
    expect(ok).toHaveBeenCalledWith(
      "/api/create/session",
      expect.objectContaining({ redirect: "manual", cache: "no-store" }),
    );
  });
  it("ログインへのリダイレクト・拒否・不正な本文・通信失敗では出さない", async () => {
    const opaque = { ok: false, status: 0, type: "opaqueredirect" } as Response;
    expect(await ownerSession(vi.fn().mockResolvedValue(opaque))).toBe(false);
    expect(await ownerSession(vi.fn().mockResolvedValue(new Response("", { status: 401 })))).toBe(
      false,
    );
    expect(await ownerSession(vi.fn().mockResolvedValue(new Response("", { status: 503 })))).toBe(
      false,
    );
    expect(await ownerSession(vi.fn().mockResolvedValue(Response.json({ signedIn: "yes" })))).toBe(
      false,
    );
    expect(
      await ownerSession(vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }))),
    ).toBe(false);
    expect(await ownerSession(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).toBe(
      false,
    );
  });
});
