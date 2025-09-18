import React, { useState } from "react";
import type { NostrEvent } from "nostr-tools";
import EventCard from "../../components/EventCard/EventCard";

export type DailyColumnProps = {
  date: string; // YYYY-MM-DD (UTC)
  label: string; // e.g., "Mon 16" or "Today"
  summary?: NostrEvent;
  events: NostrEvent[];
};

export default function DailyColumn({ date, label, summary, events }: DailyColumnProps) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  return (
    <div className="w-[340px] h-[78vh] shrink-0 border border-base-300 rounded-lg flex flex-col overflow-hidden">
      {/* Sticky column header */}
      <div className="px-3 py-2 border-b border-base-300 bg-base-200/50 sticky top-0 z-10">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs opacity-70">{date}</div>
      </div>

      {/* Single scroll area: summary first (if present), followed by events */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {summary && (
            <div className="border border-base-300 rounded-lg">
              {summaryExpanded ? (
                <div>
                  <div className="px-3 pt-2 pb-1 flex items-center gap-2">
                    <span className="badge badge-primary badge-sm">Summary</span>
                    <button className="btn btn-xs btn-ghost ml-auto" onClick={() => setSummaryExpanded(false)} aria-expanded>
                      Show less
                    </button>
                  </div>
                  <EventCard event={summary} />
                </div>
              ) : (
                <CollapsedSummaryCard event={summary} onExpand={() => setSummaryExpanded(true)} />
              )}
            </div>
          )}

          {events && events.length ? (
            events.map((evt) => <EventCard key={evt.id} event={evt} />)
          ) : (
            <div className="text-sm opacity-70">No events</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsedSummaryCard({ event, onExpand }: { event: NostrEvent; onExpand: () => void }) {
  const preview = truncate(event.content || "", 140);
  return (
    <div className="card bg-base-100">
      <div className="card-body py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="badge badge-primary badge-sm">Summary</span>
          <span className="text-xs opacity-70">Craig David</span>
          <button className="btn btn-xs btn-ghost ml-auto" onClick={onExpand} aria-expanded={false}>
            Read more
          </button>
        </div>
        <p className="text-sm opacity-90 break-words">{preview}</p>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}
