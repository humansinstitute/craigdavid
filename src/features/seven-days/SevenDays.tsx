import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { decodeToHex } from "../../lib/decode";
import { nip19 } from "nostr-tools";
import { COMMON_RELAYS, DEFAULT_PRIMARY } from "../../lib/relays";
import { pool, eventStore } from "../../lib/applesauce";
import { onlyEvents } from "applesauce-relay";
import { take, takeUntil, timer } from "rxjs";
import { getInboxes, getOutboxes, mergeRelaySets, getProfilePicture } from "applesauce-core/helpers";
import { mapEventsToStore } from "applesauce-core";
import { useSevenDayTimeline } from "./useSevenDayTimeline";
import EventCard from "../../components/EventCard/EventCard";
import { useObservableMemo } from "applesauce-react/hooks";
import BuildSongForm from "../../components/BuildSongForm";

type Props = { initialHex?: string; showBuildSongForm?: boolean };

export default function SevenDays({ initialHex, showBuildSongForm }: Props) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [hex, setHex] = useState<string | undefined>(initialHex);
  const [activeRelays, setActiveRelays] = useState<string[]>([DEFAULT_PRIMARY]);
  const [sinceTs, setSinceTs] = useState<number | undefined>();
  const [limit] = useState(1000);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const isDeepLinked = !!initialHex;

  const timeline = useSevenDayTimeline(activeRelays, hex, sinceTs, limit);

  const npub = useMemo(() => (hex ? nip19.npubEncode(hex) : undefined), [hex]);

  // Header avatar support (only used here if component is embedded without global Header)
  const craigEnvNpub = (import.meta as any).env?.VITE_APP_NPUB || (import.meta as any).env?.VITE_NPUB || "";
  const craigHex = useMemo(() => (craigEnvNpub ? decodeToHex(craigEnvNpub) : undefined), [craigEnvNpub]);

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

  useEffect(() => {
    if (!craigHex || !craigRelays.length) return;
    const sub$ = pool
      .subscription(craigRelays, [{ authors: [craigHex], kinds: [0], limit: 1 }])
      .pipe(onlyEvents(), mapEventsToStore(eventStore), takeUntil(timer(5000)))
      .subscribe({ error: () => {} });
    return () => sub$.unsubscribe();
  }, [craigHex, craigRelays.join("|")]);

  const craigProfile = useObservableMemo(
    () => (craigHex ? eventStore.profile({ pubkey: craigHex, relays: craigRelays }) : undefined),
    [craigHex, craigRelays.join("|")]
  );
  const craigPicture = getProfilePicture(craigProfile, craigHex ? `https://robohash.org/${craigHex}.png` : undefined);

  // Deep link auto-load
  useEffect(() => {
    if (initialHex) {
      const now = Math.floor(Date.now() / 1000);
      setSinceTs(now - 7 * 24 * 60 * 60);
      setHex(initialHex);
      const unsub = discoverRelays(initialHex);
      return () => unsub();
    }
  }, [initialHex]);

  function discoverRelays(authorHex: string) {
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
    try {
      // Route to /npub... to enable deep-link mode
      const npub = nip19.npubEncode(decoded);
      navigate(`/${npub}`);
    } catch (e) {
      setError("Failed to encode npub.");
    }
  }


  return (
    <div className="max-w-md mx-auto p-4">
      {/* Do not render local H1; global Header handles title/tagline. */}

      {!isDeepLinked && (
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
      )}

      {/* Build Song form appears above the events stream when requested (e.g., /npub...) */}
      {showBuildSongForm && <BuildSongForm npub={npub} events={timeline} />}

      <div className="flex flex-col gap-2">
        {!timeline?.length && <div className="opacity-70">No events loaded.</div>}
        {timeline?.map((evt) => (
          <EventCard key={evt.id} event={evt} />
        ))}
      </div>
    </div>
  );
}
