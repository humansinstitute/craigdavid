import React from "react";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import { nip19 } from "nostr-tools";
import SevenDays from "./features/seven-days/SevenDays";
import CraigAvatar from "./components/CraigAvatar";
import "./styles.css";

function DeepLinkRouter() {
  const { id } = useParams();
  if (!id) return <Navigate to="/" replace />;
  try {
    const decoded = nip19.decode(id);
    switch (decoded.type) {
      case "npub":
        return <SevenDays initialHex={decoded.data as string} />;
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
      <Header />
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

function Header() {
  return (
    <header className="text-center mt-4 mb-4">
      <CraigAvatar />
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Craig David</h1>
      <p className="opacity-80">In the year 2,000 Craiiig David had quite the week. How does yours compare?</p>
    </header>
  );
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
