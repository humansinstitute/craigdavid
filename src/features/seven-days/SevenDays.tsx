import React, { useEffect, useMemo, useState } from "react";
import WeeklySongBanner from "./WeeklySongBanner";

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
import { useObservableMemo } from "applesauce-react/hooks";
import BuildSongForm from "../../components/BuildSongForm";
import { useCraigDailySummaries } from "./useCraigDailySummaries";
import { useCraigWeeklySong } from "./useCraigWeeklySong";
import DailyColumn from "./DailyColumn";
import type { NostrEvent } from "nostr-tools";

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

  // Craig David daily summaries for this subject
  const summaries = useCraigDailySummaries(craigRelays, craigHex, hex, sinceTs, 200);

  // Deep link auto-load
  useEffect(() => {
    if (initialHex) {
      const now = new Date();
      const start = startOfUTCDay(addDaysUTC(now, -6)); // 7-day window starting 6 days ago
      setSinceTs(Math.floor(start.getTime() / 1000));
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

  // Compute last 7 day buckets (oldest on the left, today on the right)
  const dayBuckets = useMemo(() => {
    const today = startOfUTCDay(new Date());
    const buckets: { date: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDaysUTC(today, -i);
      const date = toISODate(d);
      const label = i === 0 ? "Today" : formatShortLabel(d);
      buckets.push({ date, label, start: d, end: endOfUTCDay(d) });
    }
    return buckets;
  }, []);

  // Group events by YYYY-MM-DD (UTC) and order newest first within the day
  const eventsByDay = useMemo(() => {
    const map: Record<string, NostrEvent[]> = {};
    if (timeline) {
      for (const evt of timeline) {
        if (!evt.created_at) continue;
        const date = toISODate(new Date(evt.created_at * 1000));
        if (!map[date]) map[date] = [] as NostrEvent[];
        map[date].push(evt as unknown as NostrEvent);
      }
      for (const k of Object.keys(map)) {
        map[k].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      }
    }
    return map;
  }, [timeline?.length, timeline]);

  // Index summaries by date
  const summaryByDay = useMemo(() => {
    const m: Record<string, NostrEvent | undefined> = {};
    if (summaries) {
      for (const s of summaries) m[s.date] = s.event as unknown as NostrEvent;
    }
    return m;
  }, [summaries?.length, summaries]);

  return (
    <div className="w-full p-4">
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

      {/* Roast My Week form appears above the events stream when requested (e.g., /npub...) */}


      {showBuildSongForm && <BuildSongForm npub={npub} events={timeline} />}

      {/* Weekly Song (collapsed preview above the 7-day columns) */}
      {isDeepLinked && (
        <WeeklySongBanner
          relays={craigRelays}
          craigHex={craigHex}
          subjectHex={hex}
          sinceTs={sinceTs}
        />
      )}

      {isDeepLinked && (
        <div className="overflow-x-auto">
          <div className="flex flex-row gap-4 min-w-max">
            {dayBuckets.map((b) => (
              <DailyColumn
                key={b.date}
                date={b.date}
                label={b.label}
                summary={summaryByDay[b.date]}
                events={eventsByDay[b.date] || []}
              />
            ))}
          </div>
        </div>
      )}

      {!isDeepLinked && <div className="opacity-70">Enter an npub to view the last seven days.</div>}
    </div>
  );
}

// --- utils ---
function toISODate(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}
function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}
function endOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
function addDaysUTC(d: Date, days: number): Date {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + days);
  return startOfUTCDay(nd);
}
function formatShortLabel(d: Date): string {
  const wk = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${wk} ${d.getUTCDate()}`;
}
