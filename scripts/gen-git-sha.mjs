import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let sha = 'unknown';
try {
  sha = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf-8' }).trim();
} catch {
  // Not a git repo or git not available — leave as 'unknown'
}

const outPath = join(root, 'src', 'core', 'git-sha.ts');
writeFileSync(outPath, `// Auto-generated at build time — do not edit\nexport const GIT_SHA = '${sha}';\n`, 'utf-8');

console.log(`Git SHA: ${sha}  →  src/core/git-sha.ts`);
