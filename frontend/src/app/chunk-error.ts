// Chunk load errors happen when the deployed frontend ships new hashed
// chunk names while the browser still holds the previous index.html.

export const CHUNK_RELOAD_KEY = "grok2api:chunk-reload";

export function isChunkLoadError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  return (
    name === "ChunkLoadError" ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module")
  );
}

// recoverFromChunkError reloads once so the new shell takes over. The guard
// keeps a permanently broken deployment from looping.
export function recoverFromChunkError(): boolean {
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {
    // Storage may be unavailable; a single reload attempt is still worth it.
  }
  window.location.reload();
  return true;
}
