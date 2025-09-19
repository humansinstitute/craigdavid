import React, { useState } from "react";
import { useCraigWeeklySong } from "./useCraigWeeklySong";
import { useCraigWeeklyVideo } from "./useCraigWeeklyVideo";
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
  const weeklyVideo = useCraigWeeklyVideo(relays, craigHex, subjectHex, sinceTs);
  const [expandedSong, setExpandedSong] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState(false);

  // Defensive guard: if the value we currently hold isn't tagged for this subject, don't render it.
  const isForSubject = weekly?.tags?.some((t) => t[0] === "p" && t[1] === subjectHex) ?? false;

  if (!weekly || !isForSubject) return null;

  const songPreview = truncate(weekly.content || "", 160);
  const videoPreview = weeklyVideo ? truncate(weeklyVideo.content || "", 160) : undefined;

  return (
    <div className="mb-4">
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body py-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Weekly Song (left) */}
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge badge-secondary badge-sm">Weekly song</span>
                  <button
                    className="btn btn-xs btn-ghost ml-auto"
                    onClick={() => setExpandedSong((v) => !v)}
                    aria-expanded={expandedSong}
                  >
                    {expandedSong ? "Show less" : "Read more"}
                  </button>
                </div>

                {!expandedSong ? (
                  <p className="text-sm opacity-90 break-words">{songPreview}</p>
                ) : (
                  <EventCard event={weekly} compact={true} />
                )}
              </div>
            </div>

            {/* Weekly Video (right) */}
            {weeklyVideo && (
              <div className="card bg-base-100 border border-base-300">
                <div className="card-body py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge badge-accent badge-sm">Video summary</span>
                    <button
                      className="btn btn-xs btn-ghost ml-auto"
                      onClick={() => setExpandedVideo((v) => !v)}
                      aria-expanded={expandedVideo}
                    >
                      {expandedVideo ? "Show less" : "Show more"}
                    </button>
                  </div>

                  {!expandedVideo ? (
                    <p className="text-sm opacity-90 break-words">{videoPreview}</p>
                  ) : (
                    <EventCard event={weeklyVideo} compact={true} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}
