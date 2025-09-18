import React from "react";
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from "react-router-dom";
import { nip19 } from "nostr-tools";
import SevenDays from "./features/seven-days/SevenDays";
import CraigAvatar from "./components/CraigAvatar";
import DynamicHeader from "./components/DynamicHeader";
import "./styles.css";

function DeepLinkRouter() {
  const { id } = useParams();
  if (!id) return <Navigate to="/" replace />;
  try {
    const decoded = nip19.decode(id);
    switch (decoded.type) {
      case "npub":
        return <SevenDays initialHex={decoded.data as string}  showBuildSongForm />;
      case "nprofile":
        return <SevenDays initialHex={(decoded.data as any).pubkey as string} />;
      case "note":
      case "nevent":
        return <EventView identifier={id} />;
      case "naddr":
        return <AddressView identifier={id} />;
      default:
        return <Home invalidMessage="Unsupported identifier" />;
    }
  } catch {
    return <Home invalidMessage="Invalid NIP-19 identifier" />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <DynamicHeaderWrapper />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path=":id" element={<DeepLinkRouter />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

function DynamicHeaderWrapper() {
  const location = useLocation();
  const pathId = location.pathname.slice(1); // Remove leading slash
  
  let userHex: string | undefined;
  let userNpub: string | undefined;
  
  if (pathId) {
    try {
      const decoded = nip19.decode(pathId);
      if (decoded.type === "npub") {
        userHex = decoded.data as string;
        userNpub = pathId;
      } else if (decoded.type === "nprofile") {
        userHex = (decoded.data as any).pubkey as string;
        userNpub = nip19.npubEncode(userHex);
      }
    } catch {
      // Invalid identifier, show default header
    }
  }
  
  return <DynamicHeader userHex={userHex} userNpub={userNpub} />;
}


export function ProfileView({ identifier }: { identifier: string }) {
  return <section className="max-w-md mx-auto p-4">Profile for {identifier}</section>;
}
export function EventView({ identifier }: { identifier: string }) {
  return <section className="max-w-md mx-auto p-4">Event {identifier}</section>;
}
export function AddressView({ identifier }: { identifier: string }) {
  return <section className="max-w-md mx-auto p-4">Address {identifier}</section>;
}
export function Home({ invalidMessage }: { invalidMessage?: string }) {
  return (
    <section>
      {invalidMessage && (
        <div className="max-w-md mx-auto p-4 text-error" role="status">{invalidMessage}</div>
      )}
      <SevenDays />
    </section>
  );
}
export function NotFound() {
  return <section className="max-w-md mx-auto p-4">Not Found</section>;
}
