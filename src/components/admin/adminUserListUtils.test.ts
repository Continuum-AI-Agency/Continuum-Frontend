import { describe, expect, it } from "bun:test";

import { membershipLabel } from "@/components/admin/adminUserListUtils";

describe("membershipLabel", () => {
  it("uses the singular label only for one membership", () => {
    expect(membershipLabel(0)).toBe("0 memberships");
    expect(membershipLabel(1)).toBe("1 membership");
    expect(membershipLabel(2)).toBe("2 memberships");
  });
});
