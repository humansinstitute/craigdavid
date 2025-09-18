import React from "react";

export default function BuildSongForm({ npub, events }: { npub?: string; events?: any[] }) {
  return (
    <section className="max-w-md mx-auto p-4">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!npub || !events?.length) return;
          try {
            await fetch("/api/export-events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ npub, events }),
            });
          } catch {}
        }}
      >
        <input
          className="input input-bordered flex-1 text-[16px]"
          placeholder="cashutokenforpayment..."
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-secondary text-[16px]">
          Roast My Week
        </button>
      </form>
    </section>
  );
}
