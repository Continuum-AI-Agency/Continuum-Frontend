// The one client call that changes a brand's logo. The Backend writes logo_path and the brand
// tokens generation reads together, whether the logo comes from Settings or the Library.

import {
  BRAND_LOGO_ROUTE,
  type SetBrandLogoRequest,
  type SetBrandLogoResponse,
  setBrandLogoRequestSchema,
  setBrandLogoResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

export function setBrandLogo(request: SetBrandLogoRequest): Promise<SetBrandLogoResponse> {
  return http.request<SetBrandLogoResponse>({
    path: BRAND_LOGO_ROUTE,
    method: 'POST',
    body: setBrandLogoRequestSchema.parse(request),
    schema: setBrandLogoResponseSchema,
  });
}

/** A picked file as the upload request: base64 without the data: prefix. */
export async function uploadRequestFor(brandId: string, file: File): Promise<SetBrandLogoRequest> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
  return setBrandLogoRequestSchema.parse({
    source: 'upload',
    brandId,
    contentType: file.type,
    dataBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
  });
}
