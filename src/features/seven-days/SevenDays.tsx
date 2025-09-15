import React, { useEffect, useMemo, useState } from "react";
import { decodeToHex } from "../../lib/decode";
import { COMMON_RELAYS, DEFAULT_PRIMARY } from "../../lib/relays";
import { pool, eventStore } from "../../lib/applesauce";
import { onlyEvents } from "applesauce-relay";
import { take, takeUntil, timer } from "rxjs";
import { getInboxes, getOutboxes, mergeRelaySets, getProfilePicture } from "applesauce-core/helpers";
import { mapEventsToStore } from "applesauce-core";
import { useSevenDayTimeline } from "./useSevenDayTimeline";
import EventCard from "../../components/EventCard/EventCard";
import { useObservableMemo } from "applesauce-react/hooks";

export default function SevenDays() {
  const [input, setInput] = useState("");
  const [hex, setHex] = useState<string | undefined>();
  const [activeRelays, setActiveRelays] = useState<string[]>([DEFAULT_PRIMARY]);
  const [sinceTs, setSinceTs] = useState<number | undefined>();
  const [limit] = useState(1000);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const timeline = useSevenDayTimeline(activeRelays, hex, sinceTs, limit);

  // Load app npub from env (Vite exposes only VITE_*). Support a couple common names.
  const craigEnvNpub = (import.meta as any).env?.VITE_APP_NPUB || (import.meta as any).env?.VITE_NPUB || "";
  const craigHex = useMemo(() => (craigEnvNpub ? decodeToHex(craigEnvNpub) : undefined), [craigEnvNpub]);

  // 1) Discover relays for Craig's npub via kind:10002 and use them for profile fetches
  const [craigRelays, setCraigRelays] = useState<string[]>(COMMON_RELAYS);
  useEffect(() => {
    if (!craigHex) return;
    const sub$ = pool
      .subscription(COMMON_RELAYS, [{ authors: [craigHex], kinds: [10002], limit: 1 }])
      .pipe(onlyEvents(), take(1), takeUntil(timer(3000)))
      .subscribe({
        next: (evt) => {
          const relays = mergeRelaySets([...getInboxes(evt), ...getOutboxes(evt)]);
          if (relays.length) setCraigRelays(relays);
        },
        error: () => {},
      });
    return () => sub$.unsubscribe();
  }, [craigHex]);

  // 2) Proactively fetch profile metadata (kind:0) to populate the store
  useEffect(() => {
    if (!craigHex || !craigRelays.length) return;
    const sub$ = pool
      .subscription(craigRelays, [{ authors: [craigHex], kinds: [0], limit: 1 }])
      .pipe(onlyEvents(), mapEventsToStore(eventStore), takeUntil(timer(5000)))
      .subscribe({ error: () => {} });
    return () => sub$.unsubscribe();
  }, [craigHex, craigRelays.join("|")]);

  // Observe profile using the discovered relays
  const craigProfile = useObservableMemo(
    () => (craigHex ? eventStore.profile({ pubkey: craigHex, relays: craigRelays }) : undefined),
    [craigHex, craigRelays.join("|")]
  );
  const craigPicture = getProfilePicture(craigProfile, craigHex ? `https://robohash.org/${craigHex}.png` : undefined);

  function discoverRelays(authorHex: string) {
    // Try to discover relays from kind:10002 on common relays. If found, switch to them for timeline queries.
    const sub$ = pool
      .subscription(COMMON_RELAYS, [{ authors: [authorHex], kinds: [10002], limit: 1 }])
      .pipe(onlyEvents(), take(1), takeUntil(timer(3000)))
      .subscribe({
        next: (evt) => {
          const relays = mergeRelaySets([...getInboxes(evt), ...getOutboxes(evt)]);
          if (relays.length) setActiveRelays(relays);
        },
        error: () => {
          /* ignore, keep default relay */
        },
      });

    return () => sub$.unsubscribe();
  }

  function onSevenDays() {
    setError(undefined);
    const decoded = decodeToHex(input);
    if (!decoded) {
      setError("Please enter a valid npub or 64-char hex pubkey.");
      return;
    }

    setLoading(true);
    setHex(decoded);

    // Start with default relay immediately
    const now = Math.floor(Date.now() / 1000);
    setSinceTs(now - 7 * 24 * 60 * 60);

    // Kick off discovery in the background and switch if we find any
    discoverRelays(decoded);

    // small delay to let UI update; loading will end as soon as we set sinceTs/hex
    setTimeout(() => setLoading(false), 100);
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="flex flex-col items-center text-center mt-4 mb-6">
        {craigPicture && (
          <img src={craigPicture} alt="Craig David" className="w-32 h-32 rounded-full shadow mb-4" />
        )}
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Craig David</h1>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <input
          className="input input-bordered w-full text-[16px]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSevenDays();
          }}
          placeholder="Paste npub1... or 64-char hex"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="btn btn-primary w-full text-[16px]" onClick={onSevenDays} disabled={loading}>
          {loading ? "Loading…" : "Seven days"}
        </button>
        {error && <div className="text-error text-sm">{error}</div>}
      </div>

      <div className="flex flex-col gap-2">
        {!timeline?.length && <div className="opacity-70">No events loaded.</div>}
        {timeline?.map((evt) => (
          <EventCard key={evt.id} event={evt} />
        ))}
      </div>
    </div>
  );
}
