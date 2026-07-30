export type SerializedMutationQueue = {
  enqueue<T>(mutation: () => Promise<T>): Promise<T>;
};

export function createSerializedMutationQueue(): SerializedMutationQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(mutation: () => Promise<T>): Promise<T> {
      const result = tail.then(mutation);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
