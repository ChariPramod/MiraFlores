import { describe, expect, it } from "vitest";
import { findingsInbox, runAllChecks } from "@/lib/checks/run";
import { locatorForExtractedValue } from "@/lib/documents/renderer";
import { DEFAULT_AS_OF } from "@/lib/packet/availability";
import { loadPacket } from "@/lib/packet/load";
import { projectOverview } from "@/lib/packet/projections";

describe("independent checks (Day 2)", () => {
  it("surfaces E01 EIN mismatch from printed-field agreement", () => {
    loadPacket();
    const inbox = findingsInbox({ version: "v3", asOf: DEFAULT_AS_OF });
    const e01 = inbox.open.filter((f) => f.catalogId === "E01");
    expect(e01.length).toBeGreaterThanOrEqual(1);
    const f = e01[0];
    expect(f.ruleId).toBe("printed-field-agreement");
    expect(f.ruleVersion).toBeTruthy();
    expect(f.status).toBe("fail");
    expect(f.evidenceRefs).toContain("ev-1045");
    expect(f.actual.display).toContain("74-3829516");
    expect(f.expected.display).toContain("74-3829156");
    expect(f.affectedVersions).toContain("v3");
    expect(f.evidenceAvailable).toBe(true);
    const anchor = locatorForExtractedValue("ev-1045")!;
    expect(anchor.highlightedText).toBe("74-3829156");
  });

  it("surfaces E02 omitted supplemental RSU basis", () => {
    const inbox = findingsInbox({ version: "v3", asOf: DEFAULT_AS_OF });
    const e02 = inbox.open.filter((f) => f.catalogId === "E02");
    expect(e02.length).toBeGreaterThanOrEqual(1);
    expect(e02.some((f) => f.affectedClaims.includes("F8949.B.N1"))).toBe(
      true,
    );
    const n1 = e02.find((f) => f.affectedClaims.includes("F8949.B.N1"))!;
    expect(n1.nuance).toBe("blank_vs_supported");
    expect(n1.expected.display).toMatch(/19,100/);
    expect(n1.evidenceRefs.some((r) => r === "D11" || r.startsWith("ev-"))).toBe(
      true,
    );
  });

  it("surfaces E03 duplicate interest", () => {
    const inbox = findingsInbox({ version: "v3", asOf: DEFAULT_AS_OF });
    const e03 = inbox.open.filter((f) => f.catalogId === "E03");
    expect(e03.length).toBe(1);
    expect(e03[0].affectedClaims).toEqual(
      expect.arrayContaining(["SchB.1.1", "SchB.1.2"]),
    );
    expect(e03[0].nuance).toBe("duplicate");
  });

  it("surfaces E10 missing M18 on D31 page 32", () => {
    const inbox = findingsInbox({ version: "v3", asOf: DEFAULT_AS_OF });
    const e10 = inbox.open.filter((f) => f.catalogId === "E10");
    expect(e10.length).toBe(1);
    expect(e10[0].evidenceRefs.some((r) => r.includes("D31") && r.includes("page32"))).toBe(
      true,
    );
    expect(e10[0].title).toMatch(/M18/);
    expect(e10[0].nuance).toBe("missing_support");
  });

  it("includes Brightpath as a passing positive control", () => {
    const inbox = findingsInbox({ version: "v3", asOf: DEFAULT_AS_OF });
    expect(inbox.passedControls.length).toBeGreaterThanOrEqual(1);
    const bp = inbox.passedControls.find((f) =>
      f.title.toLowerCase().includes("brightpath"),
    );
    expect(bp).toBeTruthy();
    expect(bp!.status).toBe("pass");
    expect(bp!.actual.value).toBe(260);
  });

  it("does not hardcode catalog labels inside check status logic", () => {
    const checks = runAllChecks({ version: "v3", asOf: DEFAULT_AS_OF });
    for (const check of checks) {
      expect(check.ruleId).not.toMatch(/^E\d+$/);
      for (const f of check.findings) {
        // Catalog id is a post-hoc fingerprint map, optional
        if (f.catalogId) {
          expect(f.id).not.toBe(f.catalogId);
          expect(f.id).toContain(f.checkId);
        }
      }
    }
  });

  it("shows household names on overview", () => {
    const overview = projectOverview("v3");
    expect(overview.clientName).toContain("Ngozi Okafor");
    expect(overview.clientName).toContain("Erik Lindqvist");
  });
});
