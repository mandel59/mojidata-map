import { UnicodeDatabase, type UnicodeData } from './core/unicode';
const cache = new Map<string, Promise<unknown>>();
export function loadData<T>(name: string): Promise<T> {
  let pending = cache.get(name);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/${name}.json`).then(response => {
      if (!response.ok) throw new Error(`データを読み込めません: ${name} (${response.status})`);
      return response.json();
    }).catch(error => { cache.delete(name); throw error; });
    cache.set(name, pending);
  }
  return pending as Promise<T>;
}
export const loadDatabase = () => loadData<UnicodeData>('unicode').then(data => new UnicodeDatabase(data));
export interface Emoji { cps: number[]; name: string; version: string; group: string; subgroup: string; }
export type Variations = Record<string, [number[], string][]>;
