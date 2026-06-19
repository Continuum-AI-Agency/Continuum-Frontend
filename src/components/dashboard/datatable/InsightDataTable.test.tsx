import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { InsightDataTable, type InsightColumn } from "./InsightDataTable";

type Row = { id: string; name: string; reach: number };

const rows: Row[] = [
  { id: "a", name: "Alpha", reach: 30 },
  { id: "b", name: "Bravo", reach: 50 },
  { id: "c", name: "Charlie", reach: 10 },
];

const columns: InsightColumn<Row>[] = [
  { id: "name", header: "Post", cell: (row) => <span>{row.name}</span> },
  { id: "reach", header: "Reach", align: "right", sortValue: (row) => row.reach, cell: (row) => <span>{row.reach}</span> },
];

function renderedOrder(): string[] {
  return screen.getAllByText(/Alpha|Bravo|Charlie/).map((node) => node.textContent ?? "");
}

describe("InsightDataTable", () => {
  afterEach(() => cleanup());

  it("renders rows in source order by default", () => {
    render(<InsightDataTable rows={rows} columns={columns} getRowId={(row) => row.id} />);
    expect(renderedOrder()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts descending then ascending when a sortable header is toggled", () => {
    render(<InsightDataTable rows={rows} columns={columns} getRowId={(row) => row.id} />);

    fireEvent.click(screen.getByRole("button", { name: /Reach/ }));
    expect(renderedOrder()).toEqual(["Bravo", "Alpha", "Charlie"]); // desc: 50, 30, 10

    fireEvent.click(screen.getByRole("button", { name: /Reach/ }));
    expect(renderedOrder()).toEqual(["Charlie", "Alpha", "Bravo"]); // asc: 10, 30, 50
  });

  it("reveals expanded content only for the clicked row", () => {
    render(
      <InsightDataTable
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        expandedContent={(row) => <div>insight for {row.name}</div>}
      />,
    );

    expect(screen.queryByText("insight for Bravo")).toBeNull();
    fireEvent.click(screen.getByText("Bravo"));
    expect(screen.getByText("insight for Bravo")).toBeDefined();
    expect(screen.queryByText("insight for Alpha")).toBeNull();
  });

  it("shows the empty state when there are no rows", () => {
    render(
      <InsightDataTable
        rows={[]}
        columns={columns}
        getRowId={(row) => row.id}
        emptyState="No posts yet."
      />,
    );
    expect(screen.getByText("No posts yet.")).toBeDefined();
  });

  it("renders skeleton rows while loading", () => {
    const { container } = render(
      <InsightDataTable rows={[]} columns={columns} getRowId={(row) => row.id} isLoading />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
