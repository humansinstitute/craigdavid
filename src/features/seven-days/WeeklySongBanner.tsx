import React, { useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { useCraigWeeklySong } from "./useCraigWeeklySong";
import EventCard from "../../components/EventCard/EventCard";

export default function WeeklySongBanner({
  relays,
  craigHex,
  subjectHex,
  sinceTs,
}: {
  relays: string[];
  craigHex?: string;
  subjectHex?: string;
  sinceTs?: number;
}) {
  const weekly = useCraigWeeklySong(relays, craigHex, subjectHex, sinceTs);
  const [expanded, setExpanded] = useState(false);

  // Defensive guard: if the value we currently hold isn't tagged for this subject, don't render it.
  const isForSubject = weekly?.tags?.some((t) => t[0] === "p" && t[1] === subjectHex) ?? false;

  if (!weekly || !isForSubject) return null;

  const preview = truncate(weekly.content || "", 160);

  return (
    <div className="mb-4">
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-secondary badge-sm">Weekly song</span>
            <button
              className="btn btn-xs btn-ghost ml-auto"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          </div>

          {!expanded ? (
            <p className="text-sm opacity-90 break-words">{preview}</p>
          ) : (
            <EventCard event={weekly} compact={true} />
          )}
        </div>
      </div>
    </div>
  );
}


function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}
