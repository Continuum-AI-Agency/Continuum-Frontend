import { FileSpreadsheet, FileText, type IconProps, Presentation } from '@/components/icons';
import type { OfficeDocumentType } from '@/lib/library/previewPlayable';

const ICONS = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
} as const;

export function OfficeDocumentIcon({ type, ...props }: { type: OfficeDocumentType } & IconProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden data-testid={`office-icon-${type}`} {...props} />;
}
