import React from "react";
import { getEmbededSharedEvent, getSharedEventPointer } from "applesauce-core/helpers";
import type { NostrEvent } from "nostr-tools";
import EventCard from "./EventCard";

export default function RepostCard({ event }: { event: NostrEvent }) {
  const embedded = getEmbededSharedEvent(event);
  const pointer = getSharedEventPointer(event);
  if (embedded)
    return (
      <div className="border rounded p-2 mt-2 bg-base-200">
        <EventCard event={embedded} compact />
      </div>
    );
  return <div className="border rounded p-2 mt-2 bg-base-200 text-sm">Shared event: {pointer?.id?.slice(0, 8)}...{pointer?.id?.slice(-4)}</div>;
}
