import { z } from 'zod';

const sheetCellSchema = z.union([z.string().max(5_000), z.number(), z.boolean(), z.null()]);

export const jainaSheetsExportRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sheets: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80).regex(/^[^\\/?*[\]:]+$/),
        rows: z.array(z.array(sheetCellSchema).max(50)).max(500),
      }),
    )
    .min(1)
    .max(10)
    .superRefine((sheets, context) => {
      const titles = new Set<string>();
      for (const [index, sheet] of sheets.entries()) {
        const title = sheet.title.toLocaleLowerCase();
        if (titles.has(title)) {
          context.addIssue({
            code: 'custom',
            message: 'Sheet titles must be unique',
            path: [index, 'title'],
          });
        }
        titles.add(title);
      }
    }),
});

export const jainaSheetsExportResponseSchema = z.object({
  spreadsheet_id: z.string().min(1),
  url: z.url(),
});

export type JainaSheetsExportRequest = z.infer<typeof jainaSheetsExportRequestSchema>;
export type JainaSheetsExportResponse = z.infer<typeof jainaSheetsExportResponseSchema>;
