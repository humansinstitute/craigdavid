import { onlyEvents } from "applesauce-relay";
import { useObservableMemo } from "applesauce-react/hooks";
import type { NostrEvent } from "nostr-tools";
import { pool, eventStore } from "../../lib/applesauce";
import { map, scan } from "rxjs";
import { mapEventsToStore } from "applesauce-core";

export type CraigSummary = {
  date: string;
  event: NostrEvent;
};

function getDateTag(evt: NostrEvent): string | undefined {
  const tag = evt.tags.find((t) => t[0] === "date" && t[1]);
  if (tag) return tag[1];
  if (evt.created_at) {
    const d = new Date(evt.created_at * 1000);
    const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
    return iso;
  }
  return undefined;
}

/**
 * Fetch Craig David daily summary notes (kind 1) authored by craigHex, tagged for subjectHex, and tagged with t=daily-summary.
 * Group by ["date", YYYY-MM-DD] tag and return the latest per date.
 */
export function useCraigDailySummaries(
  relays: string[],
  craigHex?: string,
  subjectHex?: string,
  sinceTs?: number,
  limit = 500
) {
  return useObservableMemo<CraigSummary[] | undefined>(() => {
    if (!craigHex || !subjectHex || !sinceTs) return undefined;

    const filters = [
      {
        authors: [craigHex],
        kinds: [1],
        since: sinceTs,
        limit,
        "#p": [subjectHex],
        "#t": ["daily-summary"],
      } as any,
    ];

    return pool
      .subscription(relays, filters)
      .pipe(
        onlyEvents(),
        mapEventsToStore(eventStore),
        scan((acc, evt: NostrEvent) => {
          const date = getDateTag(evt);
          if (!date) return acc;
          const prev = acc.get(date);
          if (!prev || evt.created_at > prev.created_at) acc.set(date, evt);
          return acc;
        }, new Map<string, NostrEvent>()),
        map((m) => {
          const items: CraigSummary[] = [];
          for (const [date, evt] of m.entries()) items.push({ date, event: evt });
          // sort by date desc (string compare works for YYYY-MM-DD)
          items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
          return items;
        })
      );
  }, [craigHex, subjectHex, sinceTs, limit, relays.join("|")]);
}
