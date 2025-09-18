import { onlyEvents } from "applesauce-relay";
import { useObservableMemo } from "applesauce-react/hooks";
import type { NostrEvent } from "nostr-tools";
import { pool, eventStore } from "../../lib/applesauce";
import { map, scan, startWith } from "rxjs";
import { mapEventsToStore } from "applesauce-core";

/**
 * Fetch the latest Craig David weekly-song (kind 1) authored by craigHex, tagged for subjectHex, with t=weekly-song.
 * Returns the newest matching event since the given time window.
 */
export function useCraigWeeklySong(
  relays: string[],
  craigHex?: string,
  subjectHex?: string,
  sinceTs?: number,
  limit = 100
) {
  return useObservableMemo<NostrEvent | undefined>(() => {
    if (!craigHex || !subjectHex || !sinceTs) return undefined;

    const filters = [
      {
        authors: [craigHex],
        kinds: [1],
        since: sinceTs,
        limit,
        "#p": [subjectHex],
        "#t": ["weekly-song"],
      } as any,
    ];

    return pool
      .subscription(relays, filters)
      .pipe(
        onlyEvents(),
        mapEventsToStore(eventStore),
        scan((latest: NostrEvent | undefined, evt: NostrEvent) => {
          if (!latest) return evt;
          return (evt.created_at || 0) > (latest.created_at || 0) ? evt : latest;
        }, undefined as NostrEvent | undefined),
        startWith(undefined),
        map((e) => e)
      );
  }, [craigHex, subjectHex, sinceTs, limit, relays.join("|")]);
}
