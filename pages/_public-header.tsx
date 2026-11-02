import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { SiteHeader } from "./_ui";
// Kept out of the public bundle: only a verified owner ever loads the nav chunk.
const AdminNav = lazy((): Promise<{ default: ComponentType }> =>
  import("./_admin-nav").catch(() => ({ default: () => null })),
);
/**
 * Public pages render no admin links on the server. After load, an Access-protected probe tells
 * whether this browser is the signed-in owner; anyone else gets Access's login redirect, which
 * `redirect: "manual"` swallows, so participants are never sent to a login screen.
 * True only for a 200 `{signedIn: true}`; Access's login redirect arrives as an opaque redirect. */
export async function ownerSession(fetcher: typeof fetch): Promise<boolean> {
  try {
    const r = await fetcher("/api/create/session", {
      redirect: "manual",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!r.ok) return false;
    const body = (await r.json()) as { signedIn?: unknown };
    return body.signedIn === true;
  } catch {
    return false;
  }
}
export function PublicHeader() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    ownerSession(fetch)
      .then((owner) => {
        if (live && owner) setSignedIn(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <SiteHeader brandHref={signedIn ? "/create/polls" : undefined}>
      {signedIn && (
        <Suspense fallback={null}>
          <AdminNav />
        </Suspense>
      )}
    </SiteHeader>
  );
}
