import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ComplaintQrDownloadGate,
  complaintQrUrl,
  downloadComplaintQrFile,
  resolveComplaintQrOrigin,
} from './complaintQr.ts';

test('prefers the configured public URL over the current browser origin', () => {
  assert.equal(
    resolveComplaintQrOrigin(' https://conectocadev.netlify.app/ ', 'http://localhost:3000'),
    'https://conectocadev.netlify.app/',
  );
});

test('falls back to the browser origin when no public URL is configured', () => {
  assert.equal(resolveComplaintQrOrigin(undefined, 'http://localhost:3000'), 'http://localhost:3000');
  assert.equal(resolveComplaintQrOrigin('   ', 'http://localhost:3000'), 'http://localhost:3000');
});

test('falls back to the browser origin when the configured URL is invalid', () => {
  assert.equal(resolveComplaintQrOrigin('conectoca', 'http://localhost:3000'), 'http://localhost:3000');
});

test('builds the universal QR URL at the origin root without business data', () => {
  assert.equal(
    complaintQrUrl('https://app.conectoca.cl/admin?businessId=private-id'),
    'https://app.conectoca.cl/reclamos',
  );
});

test('preserves the development origin and port', () => {
  assert.equal(complaintQrUrl('http://localhost:5173'), 'http://localhost:5173/reclamos');
});

test('generates and downloads the universal QR with the production options', async () => {
  const generated: Array<{ value: string; options: unknown }> = [];
  const downloads: Array<{ dataUrl: string; filename: string }> = [];

  await downloadComplaintQrFile('https://app.conectoca.cl/admin?businessId=private-id', {
    toDataURL: async (value, options) => {
      generated.push({ value, options });
      return 'data:image/png;base64,qr';
    },
    triggerDownload: (dataUrl, filename) => downloads.push({ dataUrl, filename }),
  });

  assert.deepEqual(generated, [{
    value: 'https://app.conectoca.cl/reclamos',
    options: { width: 1024, margin: 2, errorCorrectionLevel: 'H' },
  }]);
  assert.deepEqual(downloads, [{
    dataUrl: 'data:image/png;base64,qr',
    filename: 'qr-reclamos-conectoca.png',
  }]);
});

test('prevents concurrent QR downloads and unlocks after a failure', async () => {
  const gate = new ComplaintQrDownloadGate();
  let attempts = 0;
  let rejectDownload: ((error: Error) => void) | undefined;
  const first = gate.start(() => {
    attempts += 1;
    return new Promise<void>((_resolve, reject) => { rejectDownload = reject; });
  });
  const duplicate = gate.start(async () => { attempts += 1; });

  assert.equal(first.started, true);
  assert.equal(duplicate.started, false);
  assert.equal(attempts, 1);

  rejectDownload?.(new Error('QR unavailable'));
  await assert.rejects(first.promise, /QR unavailable/);

  const retry = gate.start(async () => { attempts += 1; });
  assert.equal(retry.started, true);
  await retry.promise;
  assert.equal(attempts, 2);
});
