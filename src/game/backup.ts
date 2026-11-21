import { parseLearnerData, type LearnerData } from '../core/learning/engine';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 32768) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function transformBytes(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const hasCompression = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function exportBackupCode(data: LearnerData): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  if (hasCompression()) {
    try {
      return 'WG1.' + toBase64Url(await transformBytes(encoded, new CompressionStream('deflate-raw')));
    } catch {
      // fall back to uncompressed WG0
    }
  }
  return 'WG0.' + toBase64Url(encoded);
}

export async function importBackupCode(raw: string): Promise<LearnerData | null> {
  const trimmed = raw.replace(/\s+/g, '');
  try {
    let bytes: Uint8Array;
    if (trimmed.startsWith('WG1.')) {
      if (!hasCompression()) return null;
      bytes = await transformBytes(fromBase64Url(trimmed.slice(4)), new DecompressionStream('deflate-raw'));
    } else if (trimmed.startsWith('WG0.')) {
      bytes = fromBase64Url(trimmed.slice(4));
    } else {
      return null;
    }
    return parseLearnerData(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
