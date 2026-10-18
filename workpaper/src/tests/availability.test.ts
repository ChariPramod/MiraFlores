import { describe, expect, it } from "vitest";
import { renderDocumentPage } from "@/lib/documents/renderer";
import {
  DEFAULT_AS_OF,
  listUnavailableDocuments,
  listUnavailableMessages,
  refAvailableAt,
} from "@/lib/packet/availability";
import { loadPacket } from "@/lib/packet/load";

describe("evidence availability at June 23, 2026", () => {
  it("excludes future documents D71 and D72", () => {
    loadPacket();
    const unavailable = listUnavailableDocuments(DEFAULT_AS_OF);
    expect(unavailable).toEqual(expect.arrayContaining(["D71", "D72"]));
    expect(refAvailableAt("D11", DEFAULT_AS_OF)).toBe(true);
    expect(refAvailableAt("D71", DEFAULT_AS_OF)).toBe(false);
  });

  it("excludes msg-07+ after the as-of date", () => {
    const unavailable = listUnavailableMessages(DEFAULT_AS_OF);
    expect(unavailable).toEqual(
      expect.arrayContaining(["msg-07", "msg-08", "msg-09", "msg-10"]),
    );
    expect(refAvailableAt("msg-06", DEFAULT_AS_OF)).toBe(true);
    expect(refAvailableAt("msg-07", DEFAULT_AS_OF)).toBe(false);
  });

  it("blocks direct document routes for unavailable evidence", () => {
    const page = renderDocumentPage("D71", 1, undefined, DEFAULT_AS_OF);
    expect(page).not.toBeNull();
    expect(page!.available).toBe(false);
    expect(page!.printedContent).toBe("");
    expect(page!.unavailableReason).toContain("simulation as-of");
  });
  it('gates agency containers, nested dated records and timeline references',()=>{
    expect(refAvailableAt('agency:/efile')).toBe(false);
    expect(refAvailableAt('agency:/efile/0/errors/0/message')).toBe(false);
    expect(refAvailableAt('agency:/efile/0','2026-07-14T23:59:59Z')).toBe(true);
    expect(refAvailableAt('agency:/irs_account_transcript_2025')).toBe(false);
    expect(refAvailableAt('agency:/irs_account_transcript_2025/0')).toBe(true);
    expect(refAvailableAt('agency:/irs_account_transcript_2025/1/transactions/0')).toBe(false);
    expect(refAvailableAt('agency:/ftb_account')).toBe(true);
    expect(refAvailableAt('timeline:tl-29')).toBe(false);
    expect(refAvailableAt('timeline:tl-02')).toBe(true);
    expect(refAvailableAt('agency:/missing')).toBe(false);
  });

});
