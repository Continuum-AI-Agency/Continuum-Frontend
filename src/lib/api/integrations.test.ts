import { beforeEach, describe, expect, it, mock } from "bun:test";

type MaybeSingleResult = { data: { id: string } | null; error: null };
type SingleResult = { data: { id: string }; error: null };
type DeleteResult = { error: null };

const lookupMaybeSingle = mock<() => Promise<MaybeSingleResult>>(() =>
  Promise.resolve({ data: null, error: null })
);
const insertSelectSingle = mock<() => Promise<SingleResult>>(() =>
  Promise.resolve({ data: { id: "bpia-1" }, error: null })
);
const deleteResolved = mock<() => Promise<DeleteResult>>(() =>
  Promise.resolve({ error: null })
);

const insertChain = {
  select: () => ({ single: insertSelectSingle }),
};
const lookupChain = {
  select: () => ({
    eq: () => ({
      eq: () => ({ maybeSingle: lookupMaybeSingle }),
    }),
  }),
  insert: () => insertChain,
  delete: () => ({
    eq: () => ({ eq: deleteResolved }),
  }),
};

const fromMock = mock(() => lookupChain);
const schemaMock = mock(() => ({ from: fromMock }));
const supabaseStub = { schema: schemaMock };

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => supabaseStub,
}));

import {
  assignBrandIntegrationAccount,
  unassignBrandIntegrationAccount,
} from "@/lib/api/integrations";

describe("brand integration assignment helpers", () => {
  beforeEach(() => {
    lookupMaybeSingle.mockReset();
    insertSelectSingle.mockReset();
    deleteResolved.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
  });

  it("inserts a BPIA row when no existing assignment", async () => {
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    insertSelectSingle.mockResolvedValue({ data: { id: "bpia-new" }, error: null });

    const id = await assignBrandIntegrationAccount("brand-1", "asset-1");

    expect(id).toBe("bpia-new");
    expect(schemaMock).toHaveBeenCalledWith("brand_profiles");
    expect(fromMock).toHaveBeenCalledWith("brand_profile_integration_accounts");
    expect(insertSelectSingle).toHaveBeenCalledTimes(1);
  });

  it("returns existing assignment id without inserting (idempotent)", async () => {
    lookupMaybeSingle.mockResolvedValue({ data: { id: "bpia-existing" }, error: null });

    const id = await assignBrandIntegrationAccount("brand-1", "asset-1");

    expect(id).toBe("bpia-existing");
    expect(insertSelectSingle).not.toHaveBeenCalled();
  });

  it("deletes a BPIA row by composite key", async () => {
    deleteResolved.mockResolvedValue({ error: null });

    await unassignBrandIntegrationAccount("brand-1", "asset-1");

    expect(deleteResolved).toHaveBeenCalledTimes(1);
    expect(schemaMock).toHaveBeenCalledWith("brand_profiles");
    expect(fromMock).toHaveBeenCalledWith("brand_profile_integration_accounts");
  });
});
