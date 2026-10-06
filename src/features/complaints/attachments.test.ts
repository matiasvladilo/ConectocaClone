import assert from 'node:assert/strict';
import test from 'node:test';

import { appendComplaintFiles, formatFileSize } from './attachments.ts';

function makeFile(name: string, type = 'image/jpeg', size = 4): File {
  return new File([new Uint8Array(size)], name, { type });
}

test('appendComplaintFiles blocks files beyond the five-file limit before submit', () => {
  const existing = [makeFile('one.jpg'), makeFile('two.jpg'), makeFile('three.jpg'), makeFile('four.jpg')];
  const selected = [makeFile('five.jpg'), makeFile('six.pdf', 'application/pdf')];

  const result = appendComplaintFiles(existing, selected);

  assert.deepEqual(result.files.map(file => file.name), [
    'one.jpg',
    'two.jpg',
    'three.jpg',
    'four.jpg',
    'five.jpg',
  ]);
  assert.equal(result.rejectedCount, 1);
});

test('appendComplaintFiles rejects all new files when five are already selected', () => {
  const existing = Array.from({ length: 5 }, (_, index) => makeFile(`${index}.jpg`));

  const result = appendComplaintFiles(existing, [makeFile('extra.jpg')]);

  assert.equal(result.files, existing);
  assert.equal(result.rejectedCount, 1);
});

test('formatFileSize presents bytes and megabytes without exposing raw byte counts', () => {
  assert.equal(formatFileSize(800), '800 B');
  assert.equal(formatFileSize(1_572_864), '1,5 MB');
});

test('selectComplaintFiles rejects invalid MIME types and oversized files before they reach previews', async () => {
  const attachments = await import('./attachments.ts') as typeof import('./attachments.ts') & {
    selectComplaintFiles?: (current: File[], selected: Iterable<File>) => {
      files: File[];
      errors: string[];
    };
  };

  const result = attachments.selectComplaintFiles!([], [
    makeFile('nota.txt', 'text/plain'),
    makeFile('grande.pdf', 'application/pdf', 10 * 1024 * 1024 + 1),
    makeFile('foto.jpg'),
  ]);

  assert.deepEqual(result.files.map(file => file.name), ['foto.jpg']);
  assert.deepEqual(result.errors, [
    'Solo puedes adjuntar archivos JPG, PNG, WebP o PDF.',
    'Cada archivo debe pesar como máximo 10 MB.',
  ]);
});
