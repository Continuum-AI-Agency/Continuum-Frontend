import { openTemplateDraftDb } from './templateDraftRecovery';

export type VersioningIntent = {
  id: string;
  userId: string;
  brandId: string;
  assetId: string;
  action: 'branch' | 'merge' | 'restore' | 'release' | 'rollback';
  body: Record<string, unknown>;
  createdAt: string;
  state: 'pending' | 'acknowledged' | 'dismissed';
};
export type VersioningIntentRecord = { attempts: VersioningIntent[] };
export type VersioningIntentStorage = {
  change<T>(key: string, update: (record: VersioningIntentRecord) => T): Promise<T>;
};
export const versioningIntentStorage: VersioningIntentStorage = {
  async change<T>(key: string, update: (record: VersioningIntentRecord) => T): Promise<T> {
    const db = await openTemplateDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.get(key);
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const record = (request.result as VersioningIntentRecord | undefined) ?? { attempts: [] };
          result = update(record);
          store.put(record, key);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(failure ?? tx.error ?? new Error('Could not preserve the versioning request.'));
      };
    });
  },
};

/** Frozen routing and principal survive panel switches and reloads; dismissing retains the attempt. */
export class VersioningIntentJournal {
  readonly key: string;
  constructor(
    readonly userId: string,
    readonly brandId: string,
    readonly templateId: string,
    private readonly storage: VersioningIntentStorage = versioningIntentStorage,
  ) {
    this.key = `versioning-intents:${userId}:${brandId}:${templateId}`;
  }
  pending() {
    return this.storage.change(this.key, (record) =>
      structuredClone(record.attempts.find((attempt) => attempt.state === 'pending') ?? null),
    );
  }
  capture(assetId: string, action: VersioningIntent['action'], body: Record<string, unknown>) {
    const reviewedBody = structuredClone(body);
    return this.storage.change(this.key, (record) => {
      if (record.attempts.some((attempt) => attempt.state === 'pending'))
        throw new Error('Resolve the pending versioning request before starting another.');
      const intent: VersioningIntent = {
        id: crypto.randomUUID(),
        userId: this.userId,
        brandId: this.brandId,
        assetId,
        action,
        body: reviewedBody,
        createdAt: new Date().toISOString(),
        state: 'pending',
      };
      record.attempts.push(intent);
      return structuredClone(intent);
    });
  }
  finish(id: string, state: 'acknowledged' | 'dismissed') {
    return this.storage.change(this.key, (record) => {
      const intent = record.attempts.find((attempt) => attempt.id === id);
      if (intent?.state === state) return;
      if (!intent || intent.state !== 'pending')
        throw new Error('The pending request changed. Reload its recovery record.');
      intent.state = state;
    });
  }
}
