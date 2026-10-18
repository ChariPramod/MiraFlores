import { describe, expect, it } from "vitest";
import { locatorForExtractedValue } from "@/lib/documents/renderer";
import { findCalculationPath, resolveRef } from "@/lib/packet/resolve";
import { getLine } from "@/lib/packet/indexes";
import { loadPacket } from "@/lib/packet/load";

describe("reference resolver", () => {
  it("resolves extracted values, documents, lines, and prior-year pointers", () => {
    loadPacket();
    expect(resolveRef("ev-0498").kind).toBe("extracted_value");
    expect(resolveRef("D11").kind).toBe("document");
    expect(resolveRef("doc:D31#page32").kind).toBe("document_page");
    expect(resolveRef("F1040.7").kind).toBe("line");
    expect(resolveRef("v3:F8949.B.N1").kind).toBe("line");
    expect(resolveRef("household:theo").kind).toBe("household");
    expect(resolveRef("qa-45").kind).toBe("questionnaire");
    expect(resolveRef("msg-07").kind).toBe("message");
    expect(resolveRef("call-01").kind).toBe("call_note");
    expect(
      resolveRef("py:/carryovers_into_2025/capital_loss_short").kind,
    ).toBe("prior_year");
    expect(resolveRef("agency:/irs_account_transcript_2025").kind).toBe(
      "agency",
    );
    expect(resolveRef("ref:fx.SEK.2025_average").kind).toBe("fx");
    expect(resolveRef("timeline:tl-01").kind).not.toBe("missing");
  });

  it("returns missing for unknown refs without inventing values", () => {
    expect(resolveRef("ev-9999").kind).toBe("missing");
    expect(resolveRef("D99").kind).toBe("missing");
    expect(resolveRef("nope").kind).toBe("missing");
  });

  it("traces F1040.7 calculation path to F8949.B.N1", () => {
    const path = findCalculationPath("F1040.7", "F8949.B.N1");
    expect(path).toEqual([
      "F1040.7",
      "SchD.16",
      "SchD.7",
      "SchD.2",
      "F8949.B.total",
      "F8949.B.N1",
    ]);
    const n1 = getLine("F8949.B.N1");
    expect(n1?.sources).toContain("ev-0498");
    expect(n1?.value).toBe(19240);
  });
});

describe("document anchors (identity + exact text)", () => {
  it("N1 blank basis highlights exact phrase in N1 window", () => {
    const locator = locatorForExtractedValue("ev-0498");
    expect(locator?.documentId).toBe("D28");
    expect(locator?.page).toBe(3);
    expect(locator?.highlightedText).toBe("basis (not reported)");
    expect(locator?.resolution).toBe("resolved_blank");
    expect(locator?.extractedValueId).toBe("ev-0498");
    expect(locator?.fieldKey).toBe("N1_basis");
  });

  it("D11 supplemental basis highlights lot-specific amount", () => {
    const locator = locatorForExtractedValue("ev-0066");
    expect(locator?.documentId).toBe("D11");
    expect(locator?.page).toBe(2);
    expect(locator?.highlightedText).toBe("adjusted basis 19,100.00");
    expect(locator?.resolution).toBe("resolved_match");
    expect(locator?.fieldKey).toBe("RSU-2502_adjusted_basis");
  });

  it("D62 EIN highlights printed digits that differ from extraction", () => {
    const locator = locatorForExtractedValue("ev-1045");
    expect(locator?.highlightedText).toBe("74-3829156");
    expect(locator?.resolution).toBe("resolved_mismatch");
    const packet = loadPacket().packet;
    const ev = packet.extracted_values.find((e) => e.id === "ev-1045")!;
    expect(ev.value).toBe("74-3829516");
  });
});
