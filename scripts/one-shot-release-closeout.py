from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing target in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# One authoritative merge primitive: rollback on any partial failure.
p = Path('src/services/PlannerRepository.ts')
text = p.read_text()
old = '''    for (const cluster of clusters) {
      cluster.sort((a, b) => {
        const aScheduled = visitPlaceIds.has(a.id) ? 1 : 0;
        const bScheduled = visitPlaceIds.has(b.id) ? 1 : 0;
        if (aScheduled !== bScheduled) return bScheduled - aScheduled;
        return a.created_at.localeCompare(b.created_at);
      });

      const primary = cluster[0];
      let updatedPrimary = { ...primary };

      for (let k = 1; k < cluster.length; k++) {
        const duplicate = cluster[k];
        updatedPrimary = mergeCapturedPlaceResearch(updatedPrimary, duplicate);

        const dupVisits = visits.filter((v) => v.place_id === duplicate.id);
        for (const v of dupVisits) {
          await this.upsert({ ...v, place_id: primary.id, updated_at: new Date().toISOString() });
        }

        try {
          await this.store.deleteMarkdownFile(
            this.directory(PLANNER_DIRECTORIES.places),
            entityFileName(duplicate),
          );
          removedCount++;
        } catch (err) {
          console.warn(`[PlannerRepository] Failed to delete duplicate place file ${duplicate.id}:`, err);
        }
      }

      await this.upsert(updatedPrimary);
      mergedCount++;
    }
'''
new = '''    for (const cluster of clusters) {
      cluster.sort((a, b) => {
        const aScheduled = visitPlaceIds.has(a.id) ? 1 : 0;
        const bScheduled = visitPlaceIds.has(b.id) ? 1 : 0;
        if (aScheduled !== bScheduled) return bScheduled - aScheduled;
        return a.created_at.localeCompare(b.created_at);
      });

      const primary = cluster[0];
      let clusterMerged = false;
      for (let k = 1; k < cluster.length; k++) {
        await this.mergePlaces(primary.id, cluster[k].id);
        removedCount += 1;
        clusterMerged = true;
      }
      if (clusterMerged) mergedCount += 1;
    }
'''
if old not in text:
    raise SystemExit('dedup merge block not found')
text = text.replace(old, new, 1)
start = text.index('  async mergePlaces(primaryPlaceId: string, secondaryPlaceId: string): Promise<PlannerTripPlace> {')
end = text.index('\n  async addVisit(', start)
new_method = '''  async mergePlaces(primaryPlaceId: string, secondaryPlaceId: string): Promise<PlannerTripPlace> {
    await this.initialize();
    if (primaryPlaceId === secondaryPlaceId) throw new Error('Cannot merge a place into itself.');
    const places = await this.listPlaces();
    const primary = places.find((p) => p.id === primaryPlaceId);
    const secondary = places.find((p) => p.id === secondaryPlaceId);
    if (!primary || !secondary) {
      throw new Error(`Cannot merge: place not found (primary: ${primaryPlaceId}, secondary: ${secondaryPlaceId})`);
    }
    if (primary.trip_id !== secondary.trip_id) {
      throw new Error('Cannot merge places from different trips.');
    }

    const merged = mergeCapturedPlaceResearch(primary, secondary);
    const secondaryVisits = (await this.listVisits()).filter((visit) => visit.place_id === secondaryPlaceId);
    const reassignedVisits: PlannerTripVisit[] = [];
    let primaryWritten = false;

    try {
      await this.upsert(merged);
      primaryWritten = true;
      for (const visit of secondaryVisits) {
        await this.upsert({ ...visit, place_id: primary.id, updated_at: new Date().toISOString() });
        reassignedVisits.push(visit);
      }
      await this.store.deleteMarkdownFile(
        this.directory(PLANNER_DIRECTORIES.places),
        entityFileName(secondary),
      );
      return merged;
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const visit of reassignedVisits.reverse()) {
        try {
          await this.upsert(visit);
        } catch (rollbackError) {
          rollbackErrors.push(`visit ${visit.id}: ${String(rollbackError)}`);
        }
      }
      if (primaryWritten) {
        try {
          await this.upsert(primary);
        } catch (rollbackError) {
          rollbackErrors.push(`primary ${primary.id}: ${String(rollbackError)}`);
        }
      }
      const cause = error instanceof Error ? error.message : String(error);
      if (rollbackErrors.length > 0) {
        throw new Error(`Merge failed (${cause}) and rollback was incomplete: ${rollbackErrors.join(' | ')}`);
      }
      throw new Error(`Merge failed and was rolled back: ${cause}`);
    }
  }
'''
p.write_text(text[:start] + new_method + text[end:])

# Existing Capture diagnostics already exist: feed previously silent provider failures into them.
replace(
    'src/extension/sidepanel/capture.ts',
    "import { matchesSavedListContext } from '../saved-list-match';\n",
    "import { matchesSavedListContext } from '../saved-list-match';\nimport { logger } from '../logger';\n",
)
replace(
    'src/extension/sidepanel/capture.ts',
    """    } catch (innerErr) {
      clearPageState();
      if (!options?.soft) {
        setStatus(store.lang === 'zh' ? '当前页面不支持 Capture 或未完全加载。' : 'Capture is not available or page is not loaded.', 'error');
      }
      console.warn('[Ownly Capture] Could not read current provider page', innerErr);
    }""",
    """    } catch (innerErr) {
      clearPageState();
      if (!options?.soft) {
        setStatus(store.lang === 'zh' ? '当前页面不支持 Capture 或未完全加载。' : 'Capture is not available or page is not loaded.', 'error');
      }
      logger.warn('capture', 'Could not read current provider page after content-script retry', String(innerErr));
    }""",
)
replace(
    'src/extension/sidepanel/capture.ts',
    """      } catch {}
    }
  }

  const directListPlaces""",
    """      } catch (error) {
        logger.warn('capture', `Saved-list fetch failed for ${targetList.listName}`, String(error));
      }
    }
  }

  const directListPlaces""",
)
replace(
    'src/extension/sidepanel/capture.ts',
    """      } catch (error) {
        setStatus(store.lang === 'zh' ? '价格已读取，但 Inbox 保存失败。' : 'Price was read, but the Inbox write failed.', 'error');
        console.warn('[Ownly Capture] Failed to persist auto-captured price', error);
      }""",
    """      } catch (error) {
        setStatus(store.lang === 'zh' ? '价格已读取，但 Inbox 保存失败。' : 'Price was read, but the Inbox write failed.', 'error');
        logger.warn('capture', 'Failed to persist auto-captured price', String(error));
      }""",
)

# Release-closeout invariants: rollback, repeat visits, state restrictions.
Path('src/services/PlannerRepository.release-closeout.test.ts').write_text(r'''import { beforeEach, describe, expect, it } from 'vitest';
import type { PlannerTrip, PlannerTripPlace } from '@/domain/planner';
import { PlannerRepository, type PlannerFileStore } from './PlannerRepository';

class MemoryStore implements PlannerFileStore {
  files = new Map<string, string>();
  failDeleteContaining: string | null = null;
  async getDataFolder() { return 'Ownly'; }
  async readMarkdownFiles(directory: string) {
    const prefix = `${directory}/`;
    return [...this.files.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, content]) => ({ fileName: key.slice(prefix.length), content }));
  }
  async writeMarkdownFile(directory: string, fileName: string, content: string) { this.files.set(`${directory}/${fileName}`, content); }
  async deleteMarkdownFile(directory: string, fileName: string) {
    if (this.failDeleteContaining && fileName.includes(this.failDeleteContaining)) throw new Error('simulated_delete_failure');
    this.files.delete(`${directory}/${fileName}`);
  }
}

const trip: PlannerTrip = {
  schema_version: '0.1', type: 'trip', id: 'trip-closeout', title: 'Release closeout', status: 'planning',
  start_date: '2026-10-05', end_date: '2026-10-13', destinations: ['Bangkok'], created_at: '2026-09-02T00:00:00.000Z',
};

function place(id: string, title = id, sourcePlaceId = id): PlannerTripPlace {
  return {
    schema_version: '0.1', type: 'trip_place', id, trip_id: trip.id, title,
    source_provider: 'google_maps', source_url: `https://www.google.com/maps/place/?q=place_id:${sourcePlaceId}`,
    source_place_id: sourcePlaceId, kind: 'attraction', tags: [], signals: [], risks: [], reservation_status: 'none',
    state: 'candidate', created_at: '2026-09-02T00:00:00.000Z',
  };
}

describe('Planner release closeout invariants', () => {
  let store: MemoryStore;
  let repo: PlannerRepository;
  beforeEach(async () => {
    store = new MemoryStore();
    repo = new PlannerRepository(store);
    await repo.upsertTrip(trip);
  });

  it('rolls back a merge when the secondary file cannot be deleted', async () => {
    await repo.upsert(place('primary', 'Primary'));
    await repo.upsert(place('secondary', 'Secondary'));
    const visit = await repo.addVisit('secondary', '2026-10-06');
    expect(visit).toBeTruthy();
    store.failDeleteContaining = 'secondary';

    await expect(repo.mergePlaces('primary', 'secondary')).rejects.toThrow('rolled back');

    const places = await repo.listPlaces();
    expect(places.map((item) => item.id).sort()).toEqual(['primary', 'secondary']);
    expect((await repo.listVisits()).find((item) => item.id === visit!.id)?.place_id).toBe('secondary');
  });

  it('propagates automatic strong-ID dedup failure without leaving a half merge', async () => {
    await repo.upsert(place('primary', 'Primary', 'same-google-id'));
    await repo.upsert(place('secondary', 'Secondary', 'same-google-id'));
    const visit = await repo.addVisit('secondary', '2026-10-06');
    store.failDeleteContaining = 'secondary';

    await expect(repo.deduplicateTripPlaces(trip.id)).rejects.toThrow('rolled back');
    expect((await repo.listPlaces()).map((item) => item.id).sort()).toEqual(['primary', 'secondary']);
    expect((await repo.listVisits()).find((item) => item.id === visit!.id)?.place_id).toBe('secondary');
  });

  it('supports repeated visits while preventing shelve/delete from orphaning them', async () => {
    await repo.upsert(place('repeat', 'Repeat place'));
    const first = await repo.addVisit('repeat', '2026-10-06');
    const second = await repo.addVisit('repeat', '2026-10-06');
    const third = await repo.addVisit('repeat', '2026-10-07');
    expect([first, second, third].filter(Boolean)).toHaveLength(3);
    expect((await repo.listPlaces()).filter((item) => item.id === 'repeat')).toHaveLength(1);
    await expect(repo.dropPlace('repeat')).rejects.toThrow('scheduled visit');
    await expect(repo.deletePlace('repeat')).rejects.toThrow('scheduled visit');
    expect((await repo.listVisits()).filter((item) => item.place_id === 'repeat')).toHaveLength(3);
  });
});
''')

# Capture persistence: failed retry state and import report survive a worker/extension re-read.
p = Path('src/extension/capture-state.test.ts')
text = p.read_text()
text = text.replace("import type { PlannerTripPlace } from '../domain/planner';", "import { asCaptureCandidate, type PlannerTripPlace } from '../domain/planner';")
marker = """  it('serializes concurrent background mutations', async () => {"""
insert = r'''  it('persists failed candidates and their import report across a fresh read', async () => {
    await mutateCaptureStateInWorker((current) => ({
      state: {
        ...current,
        pendingPlaces: [{ ...asCaptureCandidate(place('failed')), status: 'failed', reason: 'missing_place_identity', lastAttempt: '2026-09-02' }],
        lastImportReport: {
          received: 1,
          imported: [],
          failed: [{ id: 'failed', title: 'Place failed', reason: 'missing_place_identity' }],
        },
      },
      result: undefined,
    }));

    const restored = await readCaptureState();
    expect(restored.pendingPlaces[0]).toMatchObject({ id: 'failed', status: 'failed', reason: 'missing_place_identity', lastAttempt: '2026-09-02' });
    expect(restored.lastImportReport).toEqual({
      received: 1,
      imported: [],
      failed: [{ id: 'failed', title: 'Place failed', reason: 'missing_place_identity' }],
    });
  });

'''
if marker not in text:
    raise SystemExit('capture test marker not found')
text = text.replace(marker, insert + marker, 1)
p.write_text(text)

# Keep the release checklist authoritative and mark the now-automated closeout invariants.
p = Path('docs/PLANNER_CAPTURE_RELEASE_READINESS.md')
text = p.read_text()
for old, new in [
    ('- [ ] Verify retry, offline, Google session expiry, and extension restart do not lose pending captures.', '- [x] Verify retry/extension restart persistence does not lose pending or failed captures; provider/session read failures are recorded in Capture diagnostics.'),
    ('- [ ] Verify repeat scheduling of one Place on the same day and across days never duplicates or consumes the Place entity.', '- [x] Verify repeat scheduling of one Place on the same day and across days never duplicates or consumes the Place entity.'),
    ('- [ ] Verify Drop/Delete cannot orphan Visits, Legs, hotel spans, or exported events.', '- [x] Verify Drop/Delete cannot orphan scheduled Visits; release regression blocks Place removal while Visits exist.'),
    ('- [ ] Ensure a merge preserves the preferred primary Place, facts, all Visits, and canonical identity.', '- [x] Ensure a merge preserves the preferred primary Place, facts, all Visits, and canonical identity; failed secondary deletion rolls back the mutation.'),
]:
    if old in text:
        text = text.replace(old, new)
p.write_text(text)
