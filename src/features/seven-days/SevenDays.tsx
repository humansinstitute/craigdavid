import React, { useState } from "react";
import { decodeToHex } from "../../lib/decode";
import { COMMON_RELAYS, DEFAULT_PRIMARY } from "../../lib/relays";
import { pool } from "../../lib/applesauce";
import { onlyEvents } from "applesauce-relay";
import { take, takeUntil, timer } from "rxjs";
import { getInboxes, getOutboxes, mergeRelaySets } from "applesauce-core/helpers";
import { useSevenDayTimeline } from "./useSevenDayTimeline";
import EventCard from "../../components/EventCard/EventCard";

export default function SevenDays() {
  const [input, setInput] = useState("");
  const [hex, setHex] = useState<string | undefined>();
  const [activeRelays, setActiveRelays] = useState<string[]>([DEFAULT_PRIMARY]);
  const [sinceTs, setSinceTs] = useState<number | undefined>();
  const [limit] = useState(1000);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const timeline = useSevenDayTimeline(activeRelays, hex, sinceTs, limit);

  function discoverRelays(authorHex: string) {
    // Try to discover relays from kind:10002 on common relays. If found, switch to them.
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
      <h1 className="text-lg font-semibold mb-3">CraigDavid — Seven Days</h1>

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
