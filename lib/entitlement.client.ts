"use client";

// The browser's read-only view of what it has. One fetch per page load, shared by
// every card that asks — the request is deduped at module scope, so ten gated
// components cost one round trip, and a component that mounts later gets the cached
// answer instead of a second one.
//
// Two deliberate choices about the moment before the answer arrives:
//   • The default is FREE, not "everything". A gated feature must never flash unlocked
//     and then snap shut; the honest direction to be wrong in is closed.
//   • A failed fetch is NOT an error state the UI shows. Entitlement is presentation
//     here (the server enforces the real thing), so a hiccup degrades to the free view
//     rather than putting a scary message on an unrelated card.
import { useEffect, useState } from "react";
import { FREE, can, type Entitlement, type Feature } from "./entitlement";

let cache: Entitlement | null = null;
let inFlight: Promise<Entitlement> | null = null;

function load(): Promise<Entitlement> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = fetch("/api/entitlement", { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<Entitlement>) : FREE))
    .catch(() => FREE)
    .then((ent) => {
      cache = ent;
      inFlight = null;
      return ent;
    });
  return inFlight;
}

/** The current entitlement. Reads FREE until the server answers. */
export function useEntitlement(): Entitlement {
  const [ent, setEnt] = useState<Entitlement>(cache ?? FREE);
  useEffect(() => {
    let live = true;
    load().then((e) => {
      if (live) setEnt(e);
    });
    return () => {
      live = false;
    };
  }, []);
  return ent;
}

/** Sugar for the common case: `const unlocked = useCan("coach")`. */
export function useCan(feature: Feature): boolean {
  return can(useEntitlement().tier, feature);
}

/**
 * Forget the cached answer — call after a sign-in or a successful checkout so the page
 * re-reads its tier without a reload.
 */
export function refreshEntitlement(): void {
  cache = null;
  inFlight = null;
}
