'use client';

import { LightningBoltIcon, ReloadIcon } from '@radix-ui/react-icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { ContentGridRow, WeeklyGrid } from '@/lib/organic/types';

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
  { key: 'day', label: 'Day' },
  { key: 'type', label: 'Type' },
  { key: 'format', label: 'Format' },
  { key: 'tone', label: 'Tone' },
  { key: 'title_topic', label: 'Title / Topic', multiline: true },
  { key: 'objective', label: 'Objective', multiline: true },
  { key: 'target', label: 'Target', multiline: true },
  { key: 'cta', label: 'CTA', multiline: true },
  { key: 'num_slides', label: 'Slides' },
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
    if (value === null || value === undefined || value === '') return '—';
    return typeof value === 'number' ? value.toString() : value;
  };

  const renderEditor = (
    rowIndex: number,
    row: ContentGridRow,
    key: keyof ContentGridRow,
    multiline?: boolean,
  ) => {
    if (key === 'num_slides') {
      const numeric = row.num_slides ?? '';
      return (
        <Input
          type="number"
          value={numeric.toString()}
          onChange={(event) => onFieldChange(rowIndex, key, event.target.value)}
        />
      );
    }

    const value = (row[key] as string | undefined) ?? '';

    if (multiline) {
      return (
        <Textarea
          rows={3}
          value={value}
          onChange={(event) => onFieldChange(rowIndex, key, event.target.value)}
        />
      );
    }

    return (
      <Input value={value} onChange={(event) => onFieldChange(rowIndex, key, event.target.value)} />
    );
  };

  return (
    <div className="rounded-lg border bg-card text-card-foreground">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h2 className="text-lg font-semibold">Weekly Content Grid</h2>
          <div className="flex gap-2 items-center">
            <Button variant="secondary" onClick={onSavePlan}>
              Save Plan
            </Button>
            {isEditing ? (
              <>
                <Button variant="outline" onClick={onCancelEdit}>
                  Cancel
                </Button>
                <Button onClick={onSaveEdit}>Save Edits</Button>
              </>
            ) : (
              <Button variant="secondary" onClick={onStartEdit}>
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
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {GRID_COLUMNS.map((column) => (
                <TableHead key={column.key}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.day}-${index}`}>
                {GRID_COLUMNS.map((column) => (
                  <TableCell key={column.key}>
                    {isEditing
                      ? renderEditor(index, row, column.key, column.multiline)
                      : renderDisplayValue(row, column.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
