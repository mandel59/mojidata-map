import { localFontCoverage } from './core/localFontCoverage';

self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer; postscriptName: string }>) => {
  const { bytes, postscriptName } = event.data;
  try {
    const coverage = localFontCoverage(bytes, postscriptName);
    self.postMessage({ bytes, ...coverage }, { transfer: [bytes] });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
