import { onlyEvents } from "applesauce-relay";
import { map } from "rxjs";
import { mapEventsToStore, mapEventsToTimeline } from "applesauce-core";
import { useObservableMemo } from "applesauce-react/hooks";
import { eventStore, pool } from "../../lib/applesauce";

export function useSevenDayTimeline(relays: string[], authorHex?: string, sinceTs?: number, limit = 1000) {
  return useObservableMemo(() => {
    if (!authorHex || !sinceTs) return undefined;
    return pool
      .subscription(relays, [{ authors: [authorHex], since: sinceTs, limit }])
      .pipe(onlyEvents(), mapEventsToStore(eventStore), mapEventsToTimeline(), map((t) => [...t]));
  }, [authorHex, sinceTs, limit, relays.join("|")]);
}
