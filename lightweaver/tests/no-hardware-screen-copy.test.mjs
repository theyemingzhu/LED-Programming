// There is no screen called Hardware; owner copy must not send people to one.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
for (const f of ['src/v3/lw-pattern.jsx', 'src/lib/cardInstallGate.js']) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert(!/'Open Hardware/.test(src), `${f} still tells the owner to open Hardware`);
}
console.log('ok no-hardware-screen-copy');
