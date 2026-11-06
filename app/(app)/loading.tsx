/** Wordt getoond terwijl een pagina zijn gegevens uit de database haalt. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Laden…"
      className="h-48 animate-pulse rounded-surface border border-surface-border bg-surface"
    />
  );
}
