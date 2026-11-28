/**
 * Storage adapter keyed by string paths (always namespaced by user ID for user data).
 * Local dev: JSON file. Production: Netlify Blobs.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';

export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.m.get(key);
    return v === undefined ? null : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T) {
    this.m.set(key, JSON.stringify(value));
  }
  async delete(key: string) {
    this.m.delete(key);
  }
}

export class FileStorage implements Storage {
  private data: Record<string, unknown> | null = null;
  private writing: Promise<void> = Promise.resolve();
  constructor(private file: string) {}

  private async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch {
      this.data = {};
    }
    return this.data!;
  }
  private persist() {
    const snapshot = JSON.stringify(this.data, null, 1);
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }
  async get<T>(key: string) {
    const d = await this.load();
    return key in d ? (structuredClone(d[key]) as T) : null;
  }
  async set<T>(key: string, value: T) {
    const d = await this.load();
    d[key] = structuredClone(value);
    await this.persist();
  }
  async delete(key: string) {
    const d = await this.load();
    delete d[key];
    await this.persist();
  }
}

export class BlobStorage implements Storage {
  private storePromise: Promise<any>;
  constructor(name = 'instamart-lists') {
    this.storePromise = import('@netlify/blobs').then((m) => m.getStore({ name, consistency: 'strong' }));
  }
  async get<T>(key: string) {
    const s = await this.storePromise;
    return ((await s.get(key, { type: 'json' })) ?? null) as T | null;
  }
  async set<T>(key: string, value: T) {
    const s = await this.storePromise;
    await s.setJSON(key, value);
  }
  async delete(key: string) {
    const s = await this.storePromise;
    await s.delete(key);
  }
}

let instance: Storage | null = null;
export function getStorage(): Storage {
  if (instance) return instance;
  const cfg = getConfig();
  instance =
    cfg.storage === 'blobs'
      ? new BlobStorage()
      : new FileStorage(process.env.DATA_FILE ?? path.resolve(process.cwd(), '.data/store.json'));
  return instance;
}
export function setStorage(s: Storage) {
  instance = s;
}

export const keys = {
  session: (sid: string) => `sessions/${sid}`,
  token: (uid: string) => `users/${uid}/token`,
  lists: (uid: string) => `users/${uid}/lists`,
  draft: (uid: string, id: string) => `users/${uid}/drafts/${id}`,
  edit: (uid: string, id: string) => `users/${uid}/edits/${id}`,
  preview: (uid: string, id: string) => `users/${uid}/previews/${id}`,
  lastOrder: (uid: string) => `users/${uid}/last-order`,
  usedConfirm: (jti: string) => `confirm-used/${jti}`,
  oauthClient: (redirectUri: string) => `oauth/client/${Buffer.from(redirectUri).toString('base64url')}`,
};
