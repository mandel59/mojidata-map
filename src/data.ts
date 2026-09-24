import { UnicodeDatabase, type UnicodeData } from './core/unicode';
const cache = new Map<string, Promise<unknown>>();
// Resolved values share the same objects as the Promise cache. Synchronous reads
// let warmed character details render without another state update per selection.
const resolved = new Map<string, unknown>();
export function peekData<T>(name: string): T | undefined {
  return resolved.get(name) as T | undefined;
}
export function loadData<T>(name: string): Promise<T> {
  let pending = cache.get(name);
  if (!pending) {
    const base =
      typeof document === 'undefined'
        ? new URL('../', globalThis.location.href).href
        : document.baseURI;
    pending = fetch(new URL(`${import.meta.env.BASE_URL}data/${name}.json`, base))
      .then((response) => {
        if (!response.ok) throw new Error(`データを読み込めません: ${name} (${response.status})`);
        return response.json();
      })
      .then((data) => {
        resolved.set(name, data);
        return data;
      })
      .catch((error) => {
        cache.delete(name);
        throw error;
      });
    cache.set(name, pending);
  }
  return pending as Promise<T>;
}
export const loadDatabase = () =>
  loadData<UnicodeData>('unicode').then((data) => new UnicodeDatabase(data));
export interface Emoji {
  cps: number[];
  name: string;
  version: string;
  group: string;
  subgroup: string;
}
export type Variations = Record<string, [number[], string][]>;
