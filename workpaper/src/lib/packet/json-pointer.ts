/** Minimal RFC 6901 JSON Pointer resolver. */

export function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function getByJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") {
    return root;
  }
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer (must start with /): ${pointer}`);
  }
  const tokens = pointer
    .slice(1)
    .split("/")
    .map(decodePointerToken);
  let current: unknown = root;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return current;
}
