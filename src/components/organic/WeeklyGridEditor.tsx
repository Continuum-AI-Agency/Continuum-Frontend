"use client";

import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Table,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { LightningBoltIcon, ReloadIcon } from "@radix-ui/react-icons";

import type { ContentGridRow, WeeklyGrid } from "@/lib/organic/types";

type WeeklyGridEditorProps = {
  grid: WeeklyGrid;
  draftGrid: ContentGridRow[];
  isEditing: boolean;
  isGeneratingDetails: boolean;
  onGenerateDetails: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onSavePlan: () => void;
  onFieldChange: (rowIndex: number, key: keyof ContentGridRow, value: string) => void;
};

const GRID_COLUMNS: Array<{ key: keyof ContentGridRow; label: string; multiline?: boolean }> = [
  { key: "day", label: "Day" },
  { key: "type", label: "Type" },
  { key: "format", label: "Format" },
  { key: "tone", label: "Tone" },
  { key: "title_topic", label: "Title / Topic", multiline: true },
  { key: "objective", label: "Objective", multiline: true },
  { key: "target", label: "Target", multiline: true },
  { key: "cta", label: "CTA", multiline: true },
  { key: "num_slides", label: "Slides" },
];

export function WeeklyGridEditor({
  grid,
  draftGrid,
  isEditing,
  isGeneratingDetails,
  onGenerateDetails,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onSavePlan,
  onFieldChange,
}: WeeklyGridEditorProps) {
  const rows = isEditing ? draftGrid : grid.grid;

  const renderDisplayValue = (row: ContentGridRow, key: keyof ContentGridRow) => {
    const value = row[key];
    if (value === null || value === undefined || value === "") return "—";
    return typeof value === "number" ? value.toString() : value;
  };

  const renderEditor = (
    rowIndex: number,
    row: ContentGridRow,
    key: keyof ContentGridRow,
    multiline?: boolean
  ) => {
    if (key === "num_slides") {
      const numeric = row.num_slides ?? "";
      return (
        <TextField.Root
          type="number"
          value={numeric.toString()}
          onChange={(event) => onFieldChange(rowIndex, key, event.target.value)}
          variant="surface"
        />
      );
    }

    const value = (row[key] as string | undefined) ?? "";

    if (multiline) {
      return (
        <TextArea
          rows={3}
          value={value}
          onChange={(event) => onFieldChange(rowIndex, key, event.target.value)}
          variant="surface"
        />
      );
    }

    return (
      <TextField.Root
        value={value}
        onChange={(event) => onFieldChange(rowIndex, key, event.target.value)}
        variant="surface"
      />
    );
  };

  return (
    <Card>
      <Box p="4" className="space-y-4">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Heading size="4">Weekly Content Grid</Heading>
          <Flex gap="2" align="center">
            <Button variant="soft" onClick={onSavePlan}>
              Save Plan
            </Button>
            {isEditing ? (
              <>
                <Button variant="outline" color="gray" onClick={onCancelEdit}>
                  Cancel
                </Button>
                <Button onClick={onSaveEdit}>Save Edits</Button>
              </>
            ) : (
              <Button variant="soft" onClick={onStartEdit}>
                Edit Grid
              </Button>
            )}
            <Button onClick={onGenerateDetails} disabled={isGeneratingDetails || isEditing}>
              {isGeneratingDetails ? (
                <>
                  <ReloadIcon className="animate-spin" />
                  Generating details…
                </>
              ) : (
                <>
                  <LightningBoltIcon />
                  Generate Daily Templates
                </>
              )}
            </Button>
          </Flex>
        </Flex>

        <Table.Root>
          <Table.Header>
            <Table.Row>
              {GRID_COLUMNS.map((column) => (
                <Table.ColumnHeaderCell key={column.key}>{column.label}</Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row, index) => (
              <Table.Row key={`${row.day}-${index}`}>
                {GRID_COLUMNS.map((column) => (
                  <Table.Cell key={column.key}>
                    {isEditing
                      ? renderEditor(index, row, column.key, column.multiline)
                      : renderDisplayValue(row, column.key)}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
    </Card>
  );
}
