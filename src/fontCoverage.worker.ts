import { localFontCoverage, localFontMatch, localFontNames } from './core/localFontCoverage';

type Request =
  | { required: number[]; locale: string }
  | {
      bytes: ArrayBuffer;
      postscriptName: string;
      matchOnly?: boolean;
      namesOnly?: boolean;
      locale?: string;
    };
let required: number[] = [];
let locale = 'en';
self.onmessage = (event: MessageEvent<Request>) => {
  if ('required' in event.data) {
    required = event.data.required;
    locale = event.data.locale;
    return;
  }
  const { bytes, postscriptName, matchOnly, namesOnly } = event.data;
  try {
    if (matchOnly) {
      self.postMessage({ match: localFontMatch(bytes, postscriptName, required, locale) });
    } else if (namesOnly) {
      self.postMessage({ names: localFontNames(bytes, postscriptName, event.data.locale ?? 'en') });
    } else {
      const coverage = localFontCoverage(bytes, postscriptName);
      self.postMessage({ bytes, ...coverage }, { transfer: [bytes] });
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
