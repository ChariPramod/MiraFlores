import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
function traces(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? traces(file) : file.endsWith('.nft.json') ? [file] : [];
  });
}
const localData = resolve('.data') + sep;
let packetFound = false;
for (const file of traces('.next/server')) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const dependency of manifest.files ?? []) {
    const absolute = resolve(dirname(file), dependency);
    if (absolute.startsWith(localData)) throw new Error(`Local runtime data included in ${file}`);
    if (absolute.endsWith('data/okafor_lindqvist_2025_packet.json')) packetFound = true;
  }
}
if (!packetFound) throw new Error('Immutable packet missing from deployment traces');
console.log('Build packaging verified: packet included; local history, audit logs and signing key excluded.');
