import React from "react";
import { useRenderedContent } from "applesauce-react/hooks";
import { contentComponents } from "../../lib/content";
import type { NostrEvent } from "nostr-tools";

export default function NoteContent({ event }: { event: NostrEvent }) {
  const content = useRenderedContent(event, contentComponents);
  return <div className="whitespace-pre-wrap mt-2">{content}</div>;
}
