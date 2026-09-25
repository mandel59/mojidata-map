import { localFontCoverage, localFontMatch } from './core/localFontCoverage';

type Request =
  { required: number[] } | { bytes: ArrayBuffer; postscriptName: string; matchOnly?: boolean };
let required: number[] = [];
self.onmessage = (event: MessageEvent<Request>) => {
  if ('required' in event.data) {
    required = event.data.required;
    return;
  }
  const { bytes, postscriptName, matchOnly } = event.data;
  try {
    if (matchOnly) {
      self.postMessage({ faceIndex: localFontMatch(bytes, postscriptName, required) });
    } else {
      const coverage = localFontCoverage(bytes, postscriptName);
      self.postMessage({ bytes, ...coverage }, { transfer: [bytes] });
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
