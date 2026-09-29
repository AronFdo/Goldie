export function DemoBanner() {
  return (
    <div
      role="status"
      className="border-b border-brass-line/40 bg-ink px-4 py-2 text-center text-xs text-parchment/75"
    >
      Demo data — connect Supabase via{" "}
      <span className="font-mono text-parchment">.env.local</span> to use live
      prices
    </div>
  );
}
