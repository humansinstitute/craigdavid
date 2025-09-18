import React from "react";

export default function BuildSongForm({ npub, events }: { npub?: string; events?: any[] }) {
  const [token, setToken] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();

  return (
    <section className="max-w-md mx-auto p-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          if (!npub || !events?.length) return;

          // Simple validation: require a Cashu token string starting with "cashu"
          if (!token || !token.startsWith("cashu")) {
            setError("Please paste a valid Cashu token that starts with 'cashu'.");
            return; // Do not submit to server
          }

          try {
            await fetch("/api/export-events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ npub, events, token }),
            });
          } catch {}
        }}
      >
        <div className="flex gap-2">
          <input
            className="input input-bordered flex-1 text-[16px]"
            placeholder="cashutokenforpayment..."
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary text-[16px]">
            Roast My Week
          </button>
        </div>
        {error && (
          <div className="text-error text-sm" role="alert">
            {error}
          </div>
        )}
      </form>
    </section>
  );
}
