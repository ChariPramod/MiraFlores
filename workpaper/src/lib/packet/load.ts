import "server-only";

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { LoadedPacket, TaxPacket } from "./types";

/** Expected SHA-256 of the supplied packet bytes (never “cleaned”). */
export const EXPECTED_PACKET_SHA256 =
  "ee01f8508bd2fd9854754b82fd9c4a055bdc55e2778a132002a25381c412ad19";

export const EXPECTED_PACKET_BYTES = 1_943_262;
export const EXPECTED_DOCUMENT_COUNT = 74;
export const EXPECTED_PAGE_COUNT = 199;
export const EXPECTED_EXTRACTED_VALUE_COUNT = 3_012;
export const EXPECTED_VERSION_COUNT = 3;

const PACKET_FILENAME = "okafor_lindqvist_2025_packet.json";

/**
 * Packet must live at workpaper/data/ as a real file (not a symlink to the
 * parent assessment folder) so Vercel/production builds package the bytes.
 */
export function resolvePacketPath(): string {
  const primary = path.join(process.cwd(), "data", PACKET_FILENAME);
  if (existsSync(/*turbopackIgnore: true*/ primary)) {
    return primary;
  }
  throw new Error(
    `Packet file not found at ${primary}. Copy okafor_lindqvist_2025_packet.json into workpaper/data/ (do not rely on a parent-folder symlink).`,
  );
}

let cache: LoadedPacket | null = null;

/**
 * Load the original packet byte-for-byte, verify SHA-256, and parse once.
 * Disposable indexes build over this; the source bytes are never mutated.
 */
export function loadPacket(options?: {
  forceReload?: boolean;
  requireExpectedHash?: boolean;
}): LoadedPacket {
  if (cache && !options?.forceReload) {
    return cache;
  }

  const filePath = resolvePacketPath();
  const bytes = readFileSync(/*turbopackIgnore: true*/ filePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const requireHash = options?.requireExpectedHash !== false;
  if (requireHash && sha256 !== EXPECTED_PACKET_SHA256) {
    throw new Error(
      `Packet integrity check failed. Expected ${EXPECTED_PACKET_SHA256}, got ${sha256}`,
    );
  }

  if (bytes.byteLength !== EXPECTED_PACKET_BYTES) {
    throw new Error(
      `Packet size mismatch. Expected ${EXPECTED_PACKET_BYTES} bytes, got ${bytes.byteLength}`,
    );
  }

  const packet = JSON.parse(bytes.toString("utf8")) as TaxPacket;

  cache = {
    bytes,
    sha256,
    byteLength: bytes.byteLength,
    packet,
    loadedAt: new Date().toISOString(),
  };

  return cache;
}

export function getPacket(): TaxPacket {
  return loadPacket().packet;
}

export function getPacketIntegrity(): {
  sha256: string;
  byteLength: number;
  documentCount: number;
  pageCount: number;
  extractedValueCount: number;
  versionCount: number;
} {
  const loaded = loadPacket();
  const pageCount = loaded.packet.documents.reduce(
    (sum, doc) => sum + doc.pages.length,
    0,
  );
  return {
    sha256: loaded.sha256,
    byteLength: loaded.byteLength,
    documentCount: loaded.packet.documents.length,
    pageCount,
    extractedValueCount: loaded.packet.extracted_values.length,
    versionCount: loaded.packet.return_versions.length,
  };
}

export function assertPacketInventory(): void {
  const integrity = getPacketIntegrity();
  const checks: Array<[string, number, number]> = [
    ["documents", integrity.documentCount, EXPECTED_DOCUMENT_COUNT],
    ["pages", integrity.pageCount, EXPECTED_PAGE_COUNT],
    [
      "extracted_values",
      integrity.extractedValueCount,
      EXPECTED_EXTRACTED_VALUE_COUNT,
    ],
    ["versions", integrity.versionCount, EXPECTED_VERSION_COUNT],
  ];
  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `Packet inventory mismatch for ${label}: expected ${expected}, got ${actual}`,
      );
    }
  }
}
