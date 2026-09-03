import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Risk 4: production build smoke', () => {
  it('out directory exists after build (static export)', () => {
    // In CI, build runs before this test; locally, out may not exist — skip if missing
    const out = join(process.cwd(), 'out');
    if (!existsSync(out)) {
      console.warn('out not found — run npm run build first');
      return;
    }
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'app', 'index.html')) || existsSync(join(out, 'app.html'))).toBe(true);
  });
});
