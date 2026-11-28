/**
 * Verifies the supplied Instamart logo: present, PNG, square. Prints its SHA-256
 * so you can confirm the built/served copy is byte-identical.
 *   npm run check:brand
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const FILE = 'src/assets/brand/instamart-logo-square.png';

if (!existsSync(FILE)) {
  console.error(`\n!!! MISSING ${FILE}\n!!! The badge will render text only. Drop in the supplied logo; never draw or substitute one.\n`);
  process.exit(1);
}
const buf = readFileSync(FILE);
const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
if (!isPng) {
  console.error(`${FILE} is not a PNG.`);
  process.exit(1);
}
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
const sha = createHash('sha256').update(buf).digest('hex');
console.log(`${FILE}: ${width}x${height} PNG, sha256 ${sha}`);
if (width !== height) {
  console.error('Logo must be square (1:1).');
  process.exit(1);
}
