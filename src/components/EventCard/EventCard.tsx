import React from "react";
import type { NostrEvent } from "nostr-tools";
import ProfileHeader from "./ProfileHeader";
import NoteContent from "./NoteContent";
import RepostCard from "./RepostCard";
import MediaAttachments from "./MediaAttachments";

export default function EventCard({ event, compact = false }: { event: NostrEvent; compact?: boolean }) {
  return (
    <div className={`card bg-base-100 ${compact ? "" : "shadow-md"}`}>
      <div className="card-body">
        <ProfileHeader event={event} />
        {event.kind === 1 && <NoteContent event={event} />}
        {(event.kind === 6 || event.kind === 16) && <RepostCard event={event} />}
        {event.kind !== 1 && event.kind !== 6 && event.kind !== 16 && (
          <div className="mt-2 text-sm opacity-80">
            <span className="badge mr-2">kind {event.kind}</span>
            {event.content ? <code className="break-words">{event.content.slice(0, 200)}</code> : <span>(no content)</span>}
          </div>
        )}
        <MediaAttachments event={event} />
      </div>
    </div>
  );
}
