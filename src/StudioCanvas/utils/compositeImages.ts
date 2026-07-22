export interface CompositeResult {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export async function compositeImages(
  baseDataUrl: string,
  overlayDataUrl: string,
): Promise<CompositeResult> {
  const [baseImg, overlayImg] = await Promise.all([
    loadImage(baseDataUrl),
    loadImage(overlayDataUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = baseImg.width;
  canvas.height = baseImg.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  ctx.drawImage(baseImg, 0, 0);
  ctx.drawImage(overlayImg, 0, 0, baseImg.width, baseImg.height);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] ?? '';

  return {
    base64,
    mimeType: 'image/png',
    dataUrl,
  };
}
