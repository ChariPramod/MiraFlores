import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_DOCUMENT_COUNT,
  EXPECTED_EXTRACTED_VALUE_COUNT,
  EXPECTED_PACKET_BYTES,
  EXPECTED_PACKET_SHA256,
  EXPECTED_PAGE_COUNT,
  EXPECTED_VERSION_COUNT,
  assertPacketInventory,
  loadPacket,
  resolvePacketPath,
} from "@/lib/packet/load";

describe("immutable packet import", () => {
  it("loads the original bytes with matching SHA-256 and size", () => {
    const loaded = loadPacket({ forceReload: true });
    expect(loaded.byteLength).toBe(EXPECTED_PACKET_BYTES);
    expect(loaded.sha256).toBe(EXPECTED_PACKET_SHA256);

    const disk = readFileSync(resolvePacketPath());
    expect(createHash("sha256").update(disk).digest("hex")).toBe(
      EXPECTED_PACKET_SHA256,
    );
    expect(Buffer.compare(loaded.bytes, disk)).toBe(0);
  });

  it("matches the verified inventory counts", () => {
    assertPacketInventory();
    const { packet } = loadPacket();
    expect(packet.documents.length).toBe(EXPECTED_DOCUMENT_COUNT);
    expect(
      packet.documents.reduce((n, d) => n + d.pages.length, 0),
    ).toBe(EXPECTED_PAGE_COUNT);
    expect(packet.extracted_values.length).toBe(EXPECTED_EXTRACTED_VALUE_COUNT);
    expect(packet.return_versions.length).toBe(EXPECTED_VERSION_COUNT);
  });

  it("does not mutate source document printed content", () => {
    const a = loadPacket({ forceReload: true });
    const before = a.packet.documents.find((d) => d.id === "D62")!.pages[0]
      .printed_content;
    // Simulate a careless consumer
    (a.packet.documents.find((d) => d.id === "D62")!.pages[0] as {
      printed_content: string;
    }).printed_content = "TAMPERED";
    const b = loadPacket({ forceReload: true });
    const after = b.packet.documents.find((d) => d.id === "D62")!.pages[0]
      .printed_content;
    expect(after).toBe(before);
    expect(after).toContain("74-3829156");
    expect(after).not.toContain("TAMPERED");
  });
});
