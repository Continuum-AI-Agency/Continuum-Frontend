// The results button a generator grows once it has run a batch.
//
// It lives on the CONSUMING node, not on the batch: the pictures belong to the thing that
// made them, and a batch node that showed someone else's renders would keep showing them
// after it was rewired to a different generator.

import { Grid3x3 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { BatchRunRecord } from '../../utils/batch/generationFanout';
import { matrixFromRunRecord } from '../../utils/batch/matrix';
import { MatrixResultsDialog } from './MatrixResultsDialog';

export function BatchMatrixButton({ record }: { record: BatchRunRecord }) {
  const [open, setOpen] = useState(false);
  const total = record.completed + record.failed;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="nodrag h-7 w-7"
        data-testid="batch-matrix-open"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Batch results (${record.completed}/${total})`}
        aria-label="Open batch results matrix"
      >
        <Grid3x3 className="h-4 w-4" />
      </Button>
      {open ? (
        <MatrixResultsDialog
          open={open}
          onOpenChange={setOpen}
          title={`Batch results — ${record.completed} of ${total}`}
          layout={matrixFromRunRecord(record)}
        />
      ) : null}
    </>
  );
}
