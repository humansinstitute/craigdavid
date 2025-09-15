import React from "react";

export default function RelayPicker({ value, onChange, common = [] as string[] }: { value: string; onChange: (v: string) => void; common?: string[] }) {
  return (
    <div className="flex gap-2 items-center">
      <input className="input input-bordered" value={value} onChange={(e) => onChange(e.target.value)} placeholder="wss://..." />
      {!!common.length && (
        <select className="select select-bordered" value="" onChange={(e) => e.target.value && onChange(e.target.value)}>
          <option value="">Common relays</option>
          {common.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
