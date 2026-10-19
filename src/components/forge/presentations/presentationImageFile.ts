import { presentationImageDataSchema } from '@continuum/contracts';

export async function readPresentationImage(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const bytesBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result.split(',')[1])
        : reject(new Error('The image could not be read.'));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
  const parsed = presentationImageDataSchema.safeParse({
    bytesBase64,
    mimeType: file.type,
    alt: file.name,
  });
  if (!parsed.success) throw new Error('Choose a PNG, JPEG, WebP, or SVG image.');
  return parsed.data;
}
