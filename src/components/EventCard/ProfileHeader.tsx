import React, { useMemo } from "react";
import { useObservableMemo } from "applesauce-react/hooks";
import { getDisplayName, getProfilePicture, mergeRelaySets, getSeenRelays } from "applesauce-core/helpers";
import { neventEncode, npubEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "../../lib/applesauce";

export default function ProfileHeader({ event }: { event: NostrEvent }) {
  const relays = useMemo(() => mergeRelaySets(getSeenRelays(event)), [event]);
  const profile = useObservableMemo(() => eventStore.profile({ pubkey: event.pubkey, relays }), [event.pubkey, relays.join("|")]);
  const picture = getProfilePicture(profile, `https://robohash.org/${event.pubkey}.png`);
  const name = getDisplayName(profile, npubEncode(event.pubkey));
  const ts = new Date((event.created_at ?? 0) * 1000).toLocaleString();

  return (
    <div className="flex items-center gap-3">
      <div className="avatar">
        <div className="w-10 h-10 rounded-full overflow-hidden">
          <img src={picture} alt={name} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{name}</div>
        <div className="text-xs text-base-content/70">{ts}</div>
      </div>
      <a href={`https://njump.me/${neventEncode(event)}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-sm">
        Open
      </a>
    </div>
  );
}
