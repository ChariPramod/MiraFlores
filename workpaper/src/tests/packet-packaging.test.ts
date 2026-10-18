import { lstatSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_PACKET_BYTES,
  EXPECTED_PACKET_SHA256,
  loadPacket,
  resolvePacketPath,
} from "@/lib/packet/load";

describe("packet packaging", () => {
  it("loads a real file under workpaper/data (not a parent symlink)", () => {
    const packetPath = resolvePacketPath();
    expect(packetPath.endsWith(path.join("data", "okafor_lindqvist_2025_packet.json"))).toBe(
      true,
    );
    const st = lstatSync(packetPath);
    expect(st.isSymbolicLink()).toBe(false);
    expect(st.isFile()).toBe(true);
    const loaded = loadPacket({ forceReload: true });
    expect(loaded.sha256).toBe(EXPECTED_PACKET_SHA256);
    expect(loaded.byteLength).toBe(EXPECTED_PACKET_BYTES);
  });
});
