import { describe, expect, it } from "vitest";
import {
  claimHrefRequired,
  documentHref,
  withQuery,
} from "@/lib/navigation/href";

describe("version-preserving navigation", () => {
  it("keeps version on claim and document hrefs", () => {
    expect(claimHrefRequired("F8949.B.N1", "v2")).toBe(
      "/claim/F8949.B.N1?version=v2",
    );
    expect(claimHrefRequired("F1040.7", "v3")).toBe(
      "/claim/F1040.7?version=v3",
    );
    expect(
      documentHref("D28", 3, {
        version: "v2",
        highlight: "ev-0498",
        fromClaim: "F8949.B.N1",
      }),
    ).toBe(
      "/document/D28/page/3?version=v2&highlight=ev-0498&fromClaim=F8949.B.N1",
    );
  });

  it("round-trips fromClaim + version for back-to-claim", () => {
    const href = documentHref("D28", 3, {
      version: "v1",
      highlight: "ev-0498",
      fromClaim: "F8949.B.N1",
    });
    const url = new URL(href, "http://localhost");
    expect(url.searchParams.get("version")).toBe("v1");
    expect(url.searchParams.get("fromClaim")).toBe("F8949.B.N1");
    const back = claimHrefRequired(
      url.searchParams.get("fromClaim")!,
      url.searchParams.get("version")!,
    );
    expect(back).toBe("/claim/F8949.B.N1?version=v1");
  });

  it("withQuery omits empty values", () => {
    expect(withQuery("/x", { a: "1", b: undefined, c: "" })).toBe("/x?a=1");
  });
});
