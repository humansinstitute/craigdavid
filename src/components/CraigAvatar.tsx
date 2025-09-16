import React, { useEffect, useMemo, useState } from "react";
import { decodeToHex } from "../lib/decode";
import { COMMON_RELAYS } from "../lib/relays";
import { pool, eventStore } from "../lib/applesauce";
import { onlyEvents } from "applesauce-relay";
import { take, takeUntil, timer } from "rxjs";
import { getInboxes, getOutboxes, getProfilePicture, mergeRelaySets } from "applesauce-core/helpers";
import { mapEventsToStore } from "applesauce-core";
import { useObservableMemo } from "applesauce-react/hooks";

export default function CraigAvatar() {
  const craigEnvNpub = (import.meta as any).env?.VITE_APP_NPUB || (import.meta as any).env?.VITE_NPUB || "";
  const craigHex = useMemo(() => (craigEnvNpub ? decodeToHex(craigEnvNpub) : undefined), [craigEnvNpub]);
  const [craigRelays, setCraigRelays] = useState<string[]>(COMMON_RELAYS);
  const [hide, setHide] = useState(false);

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

  const profile = useObservableMemo(
    () => (craigHex ? eventStore.profile({ pubkey: craigHex, relays: craigRelays }) : undefined),
    [craigHex, craigRelays.join("|")]
  );

  const picture = getProfilePicture(profile, craigHex ? `https://robohash.org/${craigHex}.png` : undefined);

  if (!picture || hide) return null;
  return (
    <img
      src={picture}
      alt=""
      className="w-16 h-16 rounded-full shadow mx-auto mb-2"
      onError={() => setHide(true)}
    />
  );
}
