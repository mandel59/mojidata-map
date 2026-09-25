import { isScalar, type UnicodeDatabase } from './unicode';

export type CoverageStatus = 'covered' | 'missing' | 'control' | 'invalid';
export interface BufferCharacter {
  cp: number;
  count: number;
  status: CoverageStatus;
}

// Count distinct code points without normalizing the user's text or splitting pairs.
export function bufferCoverage(
  text: string,
  covered: ReadonlySet<number>,
  db: UnicodeDatabase,
): BufferCharacter[] {
  const characters = new Map<number, BufferCharacter>();
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    const existing = characters.get(cp);
    if (existing) {
      existing.count++;
      continue;
    }
    const category = db.category(cp);
    const status: CoverageStatus = !isScalar(cp)
      ? 'invalid'
      : category === 'Cc' ||
          category === 'Cf' ||
          db.property(cp, 'Default_Ignorable_Code_Point') === 'Yes'
        ? 'control'
        : covered.has(cp)
          ? 'covered'
          : 'missing';
    characters.set(cp, { cp, count: 1, status });
  }
  return [...characters.values()];
}
