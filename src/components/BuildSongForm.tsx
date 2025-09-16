import React from "react";

export default function BuildSongForm() {
  return (
    <section className="max-w-md mx-auto p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
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
          Build Song
        </button>
      </form>
    </section>
  );
}
