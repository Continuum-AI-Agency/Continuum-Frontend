import { FileSpreadsheet, FileText, type LucideProps, Presentation } from 'lucide-react';
import type { OfficeDocumentType } from '@/lib/library/previewPlayable';

const ICONS = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
} as const;

export function OfficeDocumentIcon({ type, ...props }: { type: OfficeDocumentType } & LucideProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden data-testid={`office-icon-${type}`} {...props} />;
}
