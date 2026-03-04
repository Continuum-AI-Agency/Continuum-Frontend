import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CampaignIndexManagerDialog } from "./CampaignIndexManagerDialog";

describe("CampaignIndexManagerDialog", () => {
  afterEach(() => {
    cleanup();
  });

  const campaigns = [
    { id: "cmp_1", name: "Prospecting Alpha", status: "ACTIVE" },
    { id: "cmp_2", name: "Retargeting Beta", status: "PAUSED" },
  ];

  it("filters campaign options and saves selected campaigns", () => {
    const onSave = mock();
    const onCancel = mock();

    render(
      <CampaignIndexManagerDialog
        campaigns={campaigns}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    expect(screen.queryByText("Prospecting Alpha")).toBeNull();

    const commandInput = screen.getByPlaceholderText("Search campaigns by name, id, status...");
    fireEvent.focus(commandInput);

    fireEvent.change(screen.getByPlaceholderText("Q1 Core Portfolio"), {
      target: { value: "Index A" },
    });
    fireEvent.change(commandInput, {
      target: { value: "Prospecting" },
    });

    fireEvent.click(screen.getByText("Prospecting Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Create index" }));

    expect(onSave).toHaveBeenCalledWith({
      id: undefined,
      name: "Index A",
      campaignIds: ["cmp_1"],
    });
  });

  it("loads existing index values and allows cancel", () => {
    const onSave = mock();
    const onCancel = mock();

    render(
      <CampaignIndexManagerDialog
        campaigns={campaigns}
        initialValue={{
          id: "index_1",
          name: "Existing Index",
          campaignIds: ["cmp_2"],
        }}
        onCancel={onCancel}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByDisplayValue("Existing Index")).toBeTruthy();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
