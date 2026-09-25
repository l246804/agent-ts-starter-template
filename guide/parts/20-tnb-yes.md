
For frameworks whose checker still needs TypeScript 6's API, the bridge replaces the
`typescript` package everywhere it is resolved — both the catalog entry and the override, or
packages that depend through `catalog:` keep resolving the unbridged one.

```bash guide:exec id=manifest-tnb when=tnb:yes
set -euo pipefail
: "${GUIDE_TNB_VERSION:?Phase 2 must answer GUIDE_TNB_VERSION when GUIDE_TNB=yes}"

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const file = "pnpm-workspace.yaml";
const spec = `npm:typescript-native-bridge@${process.env.GUIDE_TNB_VERSION}`;
let source = readFileSync(file, "utf8");

if (!/^catalog:/m.test(source)) source = `catalog:\n${source}`;
if (/^\s*typescript:/m.test(source)) {
  source = source.replace(/^\s*typescript:.*$/m, `  typescript: ${spec}`);
} else {
  source = source.replace(/^catalog:\n/m, `catalog:\n  typescript: ${spec}\n`);
}
if (/^overrides:/m.test(source)) {
  source = source.replace(/^overrides:\n/m, `overrides:\n  typescript: ${spec}\n`);
} else {
  source += `overrides:\n  typescript: ${spec}\n`;
}
writeFileSync(file, source);
NODE

grep -q 'typescript-native-bridge' pnpm-workspace.yaml
echo "ok  catalog and overrides both point at the TypeScript 6 API bridge"
```
