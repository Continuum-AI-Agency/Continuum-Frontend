type CatchUpHandler = () => Promise<void> | void;

const registry = new Map<string, CatchUpHandler>();

export function registerStrategicRunsCatchUp(brandId: string, handler: CatchUpHandler): () => void {
  registry.set(brandId, handler);
  return () => {
    const current = registry.get(brandId);
    if (current === handler) {
      registry.delete(brandId);
    }
  };
}

export async function requestStrategicRunsCatchUp(brandId: string): Promise<void> {
  const handler = registry.get(brandId);
  if (handler) {
    await handler();
  }
}
