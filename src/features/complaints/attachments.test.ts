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
