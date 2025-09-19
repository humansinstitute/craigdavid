import React from "react";

export default function BuildSongForm({ npub, events }: { npub?: string; events?: any[] }) {
  const [token, setToken] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [decision, setDecision] = React.useState<string | undefined>();

  return (
    <section className="max-w-md mx-auto p-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setDecision(undefined);
          if (!npub || !events?.length) return;

          // Simple validation: require a Cashu token string starting with "cashu"
          if (!token || !token.startsWith("cashu")) {
            setError("Please paste a valid Cashu token that starts with 'cashu'.");
            return; // Do not submit to server
          }

          setSubmitting(true);
          try {
            // 1) Access check via Context VM (isolated subprocess on server)
            const checkResp = await fetch("/api/access-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ npub, token, mode: "redeem" }),
            });
            const check = await checkResp.json().catch(() => ({}));
            const granted = check?.decision === "ACCESS_GRANTED";
            setDecision(check?.decision);
            if (!granted) {
              // Per request: explicit message on denied
              setError("access is denied, but we took the tokens anyway as there is a bug - sorry");
              return;
            }

            // 2) Proceed with export
            await fetch("/api/export-events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ npub, events, token }),
            });
          } catch (err) {
            setError("Failed to process request. Please try again.");
          } finally {
            setSubmitting(false);
          }
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
          <button type="submit" className="btn btn-secondary text-[16px]" disabled={submitting}>
            {submitting ? "Checking…" : "Roast My Week"}
          </button>
        </div>
        {error && (
          <div className="text-error text-sm" role="alert">
            {error}
          </div>
        )}
        {!error && decision === "ACCESS_GRANTED" && (
          <div className="text-success text-sm">Access granted. Building…</div>
        )}
      </form>
    </section>
  );
}
