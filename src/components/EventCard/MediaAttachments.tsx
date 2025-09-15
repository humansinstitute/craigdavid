import React from "react";
import { getMediaAttachments } from "applesauce-core/helpers";
import type { NostrEvent } from "nostr-tools";

export default function MediaAttachments({ event }: { event: NostrEvent }) {
  const attachments = getMediaAttachments(event);
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {attachments.map((a, i) => {
        const src = a.image || a.thumbnail || a.url;
        const type = a.type || "";
        if (type.startsWith("image/")) return <img key={i} src={src} alt={a.alt || "attachment"} className="max-h-80 md:max-h-96 rounded" />;
        if (type.startsWith("video/")) return <video key={i} src={src} controls className="max-h-80 md:max-h-96 rounded" />;
        if (type.startsWith("audio/")) return <audio key={i} src={src} controls className="w-full" />;
        return (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
            {a.url}
          </a>
        );
      })}
    </div>
  );
}
