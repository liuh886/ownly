import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = 'npx tsx scripts/wyqd-cli.ts';
let vaultDir: string;

function wyqd(args: string): string {
  return execSync(`${CLI} ${args}`, { encoding: 'utf-8', cwd: process.cwd() }).trim();
}

function wyqdJson(args: string): unknown {
  return JSON.parse(wyqd(args));
}

function wyqdStderr(args: string): string {
  try {
    execSync(`${CLI} ${args}`, { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
    return '';
  } catch (e: unknown) {
    const err = e as { stderr?: string };
    return (err.stderr || '').trim();
  }
}

beforeAll(() => {
  vaultDir = join(tmpdir(), `ownly-test-${Date.now()}`);
  mkdirSync(join(vaultDir, 'Ownly', 'Objects'), { recursive: true });
  mkdirSync(join(vaultDir, 'Ownly', 'Reviews'), { recursive: true });
  mkdirSync(join(vaultDir, 'Ownly', 'Snapshots'), { recursive: true });

  // Seed sample objects
  const physicalYaml = `---
schema_version: '0.1'
id: obj_test_camera
type: object
object_type: physical
title: Test Camera
status: using
category: Electronics
purchase_price: 12000
total_acquisition_cost: 13200
purchased_at: '2026-05-01'
created_at: '2026-05-01'
updated_at: '2026-06-15'
---
## Notes
`;
  writeFileSync(join(vaultDir, 'Ownly', 'Objects', '2026-05-01--test-camera.md'), physicalYaml);

  const recurringYaml = `---
schema_version: '0.1'
id: obj_test_sub
type: object
object_type: recurring_cost
title: Test Subscription
status: active
billing_amount: 20
billing_cycle: monthly
annualized_cost: 240
payment_account: Credit Card
started_at: '2026-01-01'
created_at: '2026-01-01'
---
## Notes
`;
  writeFileSync(join(vaultDir, 'Ownly', 'Objects', '2026-01-01--test-subscription.md'), recurringYaml);

  const experienceYaml = `---
schema_version: '0.1'
id: obj_test_trip
type: object
object_type: one_time_experience
title: Test Trip
status: completed
experience_subtype: travel_worldview
budget_total: 18000
actual_total: 16500
ended_at: '2026-05-04'
location:
  city: Tokyo
  country: Japan
  country_code: JP
created_at: '2026-04-01'
---
## Notes
`;
  writeFileSync(join(vaultDir, 'Ownly', 'Objects', '2026-04-01--test-trip.md'), experienceYaml);

  const reviewYaml = `---
schema_version: '0.1'
id: review_test_trip
type: review
review_type: object_review
title: Review Test Trip
target_id: obj_test_trip
reviewed_at: '2026-05-10'
summary: Great trip
food_score: 90
scenery_score: 85
experience_score: 95
created_at: '2026-05-10'
---
## Review
`;
  writeFileSync(join(vaultDir, 'Ownly', 'Reviews', '2026-05-10--review-test-trip.md'), reviewYaml);

  const snapshotYaml = `---
schema_version: '0.1'
id: snap_test_1
type: snapshot
snapshot_type: net_worth
title: Test Snapshot
snapshot_at: '2026-06-01'
is_month_end: true
net_worth: 50000
created_at: '2026-06-01'
---
## Snapshot
`;
  writeFileSync(join(vaultDir, 'Ownly', 'Snapshots', '2026-06-01--test-snapshot.md'), snapshotYaml);
});

afterAll(() => {
  rmSync(vaultDir, { recursive: true, force: true });
});

function vaultArg() {
  return `--vault ${vaultDir}`;
}

describe('object list --json', () => {
  it('returns an array of objects', () => {
    const result = wyqdJson(`object list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  }, 10000);

  it('includes stable fields on each object', () => {
    const result = wyqdJson(`object list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    for (const obj of result) {
      expect(obj.id).toBeDefined();
      expect(obj.title).toBeDefined();
      expect(obj.object_type).toBeDefined();
      expect(obj.status).toBeDefined();
      expect(obj.fileName).toBeDefined();
      expect(obj.created_at).toBeDefined();
      expect(typeof obj.has_review).toBe('boolean');
      expect(typeof obj.needs_review).toBe('boolean');
    }
  });

  it('includes cost fields for physical objects', () => {
    const result = wyqdJson(`object list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    const camera = result.find((o) => o.id === 'obj_test_camera');
    expect(camera).toBeDefined();
    expect(camera!.purchase_price).toBe(12000);
    expect(camera!.total_acquisition_cost).toBe(13200);
  });

  it('includes billing fields for recurring_cost objects', () => {
    const result = wyqdJson(`object list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    const sub = result.find((o) => o.id === 'obj_test_sub');
    expect(sub).toBeDefined();
    expect(sub!.billing_amount).toBe(20);
    expect(sub!.billing_cycle).toBe('monthly');
  });

  it('includes travel fields for one_time_experience objects', () => {
    const result = wyqdJson(`object list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    const trip = result.find((o) => o.id === 'obj_test_trip');
    expect(trip).toBeDefined();
    expect(trip!.budget_total).toBe(18000);
    expect(trip!.actual_total).toBe(16500);
    expect(trip!.experience_subtype).toBe('travel_worldview');
    expect((trip!.location as Record<string, unknown>)?.city).toBe('Tokyo');
  });

  it('sets has_review=true and needs_review=false for reviewed objects', () => {
    const result = wyqdJson(`object list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    const trip = result.find((o) => o.id === 'obj_test_trip');
    expect(trip).toBeDefined();
    expect(trip!.has_review).toBe(true);
    expect(trip!.needs_review).toBe(false);
  });
});

describe('object get --id', () => {
  it('returns a single standardized object with --json', () => {
    const result = wyqdJson(`object get --id obj_test_trip --json ${vaultArg()}`) as Record<string, unknown>;
    expect(result.id).toBe('obj_test_trip');
    expect(result.object_type).toBe('one_time_experience');
    expect(result.has_review).toBe(true);
    expect(result.needs_review).toBe(false);
    expect(result.fileName).toBeDefined();
    expect(result.budget_total).toBe(18000);
    expect(result.actual_total).toBe(16500);
  });
});

describe('snapshot list --json', () => {
  it('returns snapshot fields, not object row fields', () => {
    const result = wyqdJson(`snapshot list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    // Snapshots don't have object_type or needs_review
    for (const s of result) {
      expect(s.object_type).toBeUndefined();
      expect(s.needs_review).toBeUndefined();
      expect(s.has_review).toBeUndefined();
    }
  });
});

describe('review list --json', () => {
  it('returns review fields, not object row fields', () => {
    const result = wyqdJson(`review list --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    expect(result.length).toBeGreaterThanOrEqual(1);
    const review = result[0];
    expect(review.review_type).toBeDefined();
    expect(review.reviewed_at).toBeDefined();
    expect(review.object_type).toBeUndefined();
    expect(review.needs_review).toBeUndefined();
  });
});

describe('object search --query', () => {
  it('finds objects by title', () => {
    const result = wyqdJson(`object search --query camera ${vaultArg()}`) as Array<Record<string, unknown>>;
    expect(result.length).toBeGreaterThanOrEqual(1);
    const camera = result.find((o) => o.id === 'obj_test_camera');
    expect(camera).toBeDefined();
  });

  it('returns standardized rows', () => {
    const result = wyqdJson(`object search --query test ${vaultArg()}`) as Array<Record<string, unknown>>;
    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const obj of result) {
      expect(obj.id).toBeDefined();
      expect(obj.object_type).toBeDefined();
    }
  });
});

describe('object review-needed', () => {
  it('returns objects needing review', () => {
    const result = wyqdJson(`object review-needed ${vaultArg()}`) as Array<Record<string, unknown>>;
    // Test Trip is completed and has a review, so should NOT appear
    const trip = result.find((o) => o.id === 'obj_test_trip');
    expect(trip).toBeUndefined();
  });
});

describe('summary --json', () => {
  it('returns vault statistics', () => {
    const result = wyqdJson(`summary --json ${vaultArg()}`) as Record<string, unknown>;
    expect(typeof result.total_objects).toBe('number');
    expect(typeof result.physical).toBe('number');
    expect(typeof result.active_recurring_costs).toBe('number');
    expect(typeof result.travel_experiences).toBe('number');
    expect(typeof result.needs_review_count).toBe('number');
    expect(typeof result.data_folder).toBe('string');
  });

  it('reports correct counts', () => {
    const result = wyqdJson(`summary --json ${vaultArg()}`) as Record<string, unknown>;
    expect(result.total_objects).toBe(3);
    expect(result.travel_experiences).toBe(1);
  });
});

describe('recurring list --active --json', () => {
  it('returns only active recurring costs', () => {
    const result = wyqdJson(`recurring list --active --json ${vaultArg()}`) as Array<Record<string, unknown>>;
    expect(Array.isArray(result)).toBe(true);
    for (const obj of result) {
      expect(obj.object_type).toBe('recurring_cost');
      expect(obj.status).toBe('active');
    }
  });
});

describe('JSON error output', () => {
  it('returns JSON with code NOT_FOUND for missing object', () => {
    const stderr = wyqdStderr(`object get --id nonexistent --json ${vaultArg()}`);
    expect(stderr).toBeTruthy();
    const err = JSON.parse(stderr);
    expect(err.error).toBeDefined();
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns JSON with code MISSING_OPTION for search without --query', () => {
    const stderr = wyqdStderr(`object search --json ${vaultArg()}`);
    expect(stderr).toBeTruthy();
    const err = JSON.parse(stderr);
    expect(err.error).toBeDefined();
    expect(err.code).toBe('MISSING_OPTION');
  });
});

describe('write commands', () => {
  it('object add --json returns AgentObjectRow', () => {
    const result = wyqdJson(`object add --json --title "CLI Test Item" --amount 999 --object-type physical ${vaultArg()}`) as Record<string, unknown>;
    expect(result.id).toBeDefined();
    expect(result.title).toBe('CLI Test Item');
    expect(result.object_type).toBe('physical');
    expect(result.fileName).toBeDefined();
    expect(typeof result.has_review).toBe('boolean');
    expect(typeof result.needs_review).toBe('boolean');
  });

  it('object update --json returns updated AgentObjectRow', () => {
    const result = wyqdJson(`object update --json --id obj_test_camera --category "Updated Category" ${vaultArg()}`) as Record<string, unknown>;
    expect(result.id).toBe('obj_test_camera');
    expect(result.category).toBe('Updated Category');
  });

  it('review link returns linked pair', () => {
    const result = wyqdJson(`object link --object_id obj_test_camera --review_id review_test_trip ${vaultArg()}`) as Record<string, unknown>;
    const obj = result.object as Record<string, unknown>;
    const review = result.review as Record<string, unknown>;
    expect(obj.review_ref).toBe('review_test_trip');
    expect(review.target_id).toBe('obj_test_camera');
  });

  it('batch-review-needed returns processed count', () => {
    const result = wyqdJson(`object batch-review-needed ${vaultArg()}`) as Record<string, unknown>;
    expect(typeof result.processed).toBe('number');
    expect(Array.isArray(result.updated)).toBe(true);
  });

  it('write command returns JSON error on missing --yes', () => {
    const stderr = wyqdStderr(`object delete --id obj_test_camera --json ${vaultArg()}`);
    const err = JSON.parse(stderr);
    expect(err.code).toBe('MISSING_OPTION');
  });
});
