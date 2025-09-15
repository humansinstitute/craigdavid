import React from "react";
import { ComponentMap } from "applesauce-react/hooks";
import { isAudioURL, isImageURL, isVideoURL } from "applesauce-core/helpers";
import type { Link } from "applesauce-content/nast";

export function LinkRenderer({ node: link }: { node: Link }) {
  if (isImageURL(link.href))
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer">
        <img src={link.href} className="max-h-80 md:max-h-96 rounded" alt="Embedded image" />
      </a>
    );
  else if (isVideoURL(link.href)) return <video src={link.href} className="max-h-80 md:max-h-96 rounded" controls />;
  else if (isAudioURL(link.href)) return <audio src={link.href} className="w-full" controls />;
  else
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
        {link.value}
      </a>
    );
}

export const contentComponents: ComponentMap = {
  text: ({ node }) => <span>{node.value}</span>,
  link: LinkRenderer,
  mention: ({ node }) => (
    <a href={`https://njump.me/${node.encoded}`} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">
      @{node.encoded.slice(0, 9)}...{node.encoded.slice(-4)}
    </a>
  ),
  hashtag: ({ node }) => <span className="text-orange-500">#{node.hashtag}</span>,
  emoji: ({ node }) => <img title={node.raw} src={node.url} className="inline h-6 w-6" alt={node.raw} />,
  gallery: ({ node }) => (
    <div className="flex flex-wrap gap-2 my-2">
      {node.links.map((href, i) => (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer">
          <img src={href} className="max-h-80 md:max-h-96 rounded" alt="Gallery image" />
        </a>
      ))}
    </div>
  ),
};
