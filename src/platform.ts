export async function copyText(text: string): Promise<void> {
  if (window.mojidata) await window.mojidata.copyText(text);
  else if (navigator.clipboard) await navigator.clipboard.writeText(text);
  else
    throw new Error(
      'この環境ではコピー API を利用できません。テキストを選択してコピーしてください。',
    );
}

export function download(name: string, content: BlobPart, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface LocalFont {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFont[]>;
    mojidata?: {
      copyText(text: string): Promise<void>;
      setAlwaysOnTop(value: boolean): Promise<void>;
      version: string;
    };
  }
}
