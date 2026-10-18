import { describe, expect, it } from "vitest";
import { locatePrintedText } from "@/lib/documents/anchors";
import { loadPacket } from "@/lib/packet/load";

function pageOf(docId: string, pageNum: number) {
  const doc = loadPacket().packet.documents.find((d) => d.id === docId)!;
  return doc.pages.find((p) => p.page === pageNum)!;
}

function ev(id: string) {
  return loadPacket().packet.extracted_values.find((e) => e.id === id)!;
}

describe("lot-specific printed anchors", () => {
  it("highlights N1 basis (not reported), not N3’s identical phrase", () => {
    const locator = locatePrintedText(pageOf("D28", 3), ev("ev-0498"));
    expect(locator.resolution).toBe("resolved_blank");
    expect(locator.highlightedText).toBe("basis (not reported)");
    expect(locator.textAnchor).toBeTruthy();
    const content = pageOf("D28", 3).printed_content;
    const start = locator.textAnchor!.start;
    // Must sit inside the N1 clause (before N2)
    const n1 = content.indexOf("N1 ");
    const n2 = content.indexOf("N2 ");
    expect(n1).toBeGreaterThanOrEqual(0);
    expect(n2).toBeGreaterThan(n1);
    expect(start).toBeGreaterThan(n1);
    expect(start).toBeLessThan(n2);
  });

  it("highlights N3 basis in its own lot window", () => {
    const locator = locatePrintedText(pageOf("D28", 3), ev("ev-0516"));
    expect(locator.resolution).toBe("resolved_blank");
    expect(locator.highlightedText).toBe("basis (not reported)");
    const content = pageOf("D28", 3).printed_content;
    const start = locator.textAnchor!.start;
    const n3 = content.indexOf("N3 ");
    const n4 = content.indexOf("N4 ");
    expect(start).toBeGreaterThan(n3);
    expect(start).toBeLessThan(n4);
  });

  it("highlights RSU-2502 adjusted basis amount, not RSU-2505’s same 19,100.00", () => {
    const locator = locatePrintedText(pageOf("D11", 2), ev("ev-0066"));
    expect(locator.resolution).toBe("resolved_match");
    expect(locator.highlightedText).toMatch(/adjusted basis 19,100\.00/i);
    const content = pageOf("D11", 2).printed_content;
    const start = locator.textAnchor!.start;
    const lot2502 = content.indexOf("RSU-2502");
    const lot2505 = content.indexOf("RSU-2505");
    expect(start).toBeGreaterThan(lot2502);
    expect(start).toBeLessThan(lot2505);
  });

  it("highlights printed EIN on D62 that differs from extraction (E01 evidence)", () => {
    const locator = locatePrintedText(pageOf("D62", 1), ev("ev-1045"));
    expect(locator.resolution).toBe("resolved_mismatch");
    expect(locator.highlightedText).toBe("74-3829156");
    expect(String(ev("ev-1045").value)).toBe("74-3829516");
    expect(locator.highlightedText).not.toBe(String(ev("ev-1045").value));
  });

  it("marks repeated ambiguous amounts without lot scope as unresolved", () => {
    // Fabricate: same page content with a non-lot field matching a repeated amount
    const page = pageOf("D11", 2);
    const fake = {
      ...ev("ev-0066"),
      id: "ev-fake",
      field: "some_amount",
      label: "Some amount",
      value: 19100.0,
      text_as_read: "19,100.00",
      value_type: "money",
    };
    const locator = locatePrintedText(page, fake);
    expect(locator.resolution).toBe("unresolved");
    expect(locator.textAnchor).toBeUndefined();
  });
});
