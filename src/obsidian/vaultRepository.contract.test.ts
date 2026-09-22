import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { parseMarkdownEntity } from '@/data/frontmatter';
import type { PhysicalObject, ReviewEntry } from '@/domain/types';
import { ObsidianVaultRepository } from './vaultRepository';

/**
 * Obsidian runtime mutation contract.
 *
 * QUALITY_BASELINE lists "the Obsidian adapter must run the same mutation
 * contract" as a Major risk before Web/PWA/Obsidian parity can be claimed.
 * The Web/PWA contract lives in MarkdownEntityRepository.contract.test.ts;
 * this suite exercises the same lifecycle against ObsidianVaultRepository with
 * a fake Vault (the `obsidian` package is aliased to a stub in vitest.config.ts)
 * so both adapters are pinned to one behavior.
 */

// The real `obsidian` types declare TFile/TFolder without public constructors;
// at test runtime they resolve to the stub (vitest alias) which accepts a path.
type ObsFile = InstanceType<typeof TFile>;
type ObsFolder = InstanceType<typeof TFolder>;
const makeFile = (path: string): ObsFile =>
  new (TFile as unknown as new (p: string) => ObsFile)(path);
const makeFolder = (path: string): ObsFolder =>
  new (TFolder as unknown as new (p: string) => ObsFolder)(path);

class FakeVault {
  files = new Map<string, string>();
  folders = new Set<string>();
  failDelete: string | null = null;
  adapter = {
    remove: async (path: string) => {
      this.files.delete(path);
    },
  };

  async cachedRead(file: ObsFile) {
    return this.files.get(file.path) ?? '';
  }
  async read(file: ObsFile) {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`not found: ${file.path}`);
    return content;
  }
  async create(path: string, content: string) {
    if (this.files.has(path) || this.folders.has(path)) throw new Error(`already exists: ${path}`);
    this.files.set(path, content);
    return makeFile(path);
  }
  async modify(file: ObsFile, content: string) {
    this.files.set(file.path, content);
  }
  async trash(file: ObsFile) {
    if (this.failDelete && file.path.includes(this.failDelete)) throw new Error('simulated_trash_failure');
    this.files.delete(file.path);
  }
  async createFolder(path: string) {
    this.folders.add(path);
  }
  getMarkdownFiles() {
    return [...this.files.keys()].filter((path) => path.endsWith('.md')).map(makeFile);
  }
  getAllFolders() {
    return [...this.folders].map(makeFolder);
  }
  getAbstractFileByPath(path: string) {
    if (this.files.has(path)) return makeFile(path);
    if (this.folders.has(path)) return makeFolder(path);
    return null;
  }
}

function physical(overrides: Partial<PhysicalObject> = {}): PhysicalObject {
  return {
    schema_version: '0.1',
    id: 'object-physical-1',
    type: 'object',
    object_type: 'physical',
    title: 'Travel Camera',
    status: 'observing',
    created_at: '2026-08-01',
    purchase_price: 12000,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewEntry> = {}): ReviewEntry {
  return {
    schema_version: '0.1',
    id: 'review-1',
    type: 'review',
    title: 'Travel Camera review',
    created_at: '2026-08-01',
    reviewed_at: '2026-08-01',
    review_type: 'object_review',
    target_id: 'object-physical-1',
    target_type: 'physical',
    summary: 'Useful when travelling.',
    ...overrides,
  };
}

function setup() {
  const vault = new FakeVault();
  // Production constructs this with an App (which has a FileManager); the
  // repository deletes through FileManager.trashFile.
  const app = { vault, fileManager: { trashFile: (file: InstanceType<typeof TFile>) => vault.trash(file) } };
  const repository = new ObsidianVaultRepository(app as never, { dataFolder: 'Ownly' });
  return { vault, repository };
}

describe('ObsidianVaultRepository mutation contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates objects with collision-safe filenames and preserves the body', async () => {
    const { vault, repository } = setup();

    const first = await repository.saveObject(physical(), 'Physical body');
    const second = await repository.saveObject(physical({ title: 'Travel Camera' }), 'Second body');

    expect(first).toBe('2026-08-01--travel-camera.md');
    expect(second).toBe('2026-08-01--travel-camera--2.md');

    const listed = await repository.listObjects();
    expect(listed).toHaveLength(2);

    const parsed = parseMarkdownEntity<PhysicalObject>(vault.files.get(`Ownly/Objects/${first}`)!);
    expect(parsed.frontmatter.id).toBe('object-physical-1');
    expect(parsed.body).toContain('Physical body');
  });

  it('updates an object and reloads it through a fresh repository instance', async () => {
    const { vault, repository } = setup();
    const fileName = await repository.saveObject(physical(), 'Initial body');
    await repository.updateObject(fileName, physical({ status: 'using' }), 'Updated body');

    const reloaded = new ObsidianVaultRepository(
      { vault, fileManager: { trashFile: (file: InstanceType<typeof TFile>) => vault.trash(file) } } as never,
      { dataFolder: 'Ownly' },
    );
    const [entry] = await reloaded.listObjects();
    expect(entry.entity.status).toBe('using');
    expect(entry.body).toContain('Updated body');
  });

  it('archives before deleting the active source and restores the original filename', async () => {
    const { vault, repository } = setup();
    const fileName = await repository.saveObject(physical(), 'Body');

    const archiveName = await repository.archiveObject(fileName);
    expect(vault.files.has(`Ownly/Objects/${fileName}`)).toBe(false);
    expect(vault.files.has(`Ownly/Archive/Objects/${archiveName}`)).toBe(true);
    expect(await repository.listObjects()).toHaveLength(0);

    const archived = await repository.listArchivedEntities();
    expect(archived).toHaveLength(1);
    expect(archived[0].archiveType).toBe('object');

    const restoredName = await repository.restoreObject(archiveName);
    expect(restoredName).toBe(fileName);
    expect(await repository.listObjects()).toHaveLength(1);
    expect(await repository.listArchivedEntities()).toHaveLength(0);
  });

  it('rolls back the archive copy when the source cannot be deleted', async () => {
    const { vault, repository } = setup();
    const fileName = await repository.saveObject(physical(), 'Body');
    vault.failDelete = `Ownly/Objects/${fileName}`;

    await expect(repository.archiveObject(fileName)).rejects.toThrow('simulated_trash_failure');

    // No duplicate archive copy survives, and the active source is untouched.
    expect(await repository.listArchivedEntities()).toHaveLength(0);
    expect(await repository.listObjects()).toHaveLength(1);
  });

  it('permanently deletes an archived entity', async () => {
    const { vault, repository } = setup();
    const fileName = await repository.saveObject(physical(), 'Body');
    const archiveName = await repository.archiveObject(fileName);

    await repository.permanentlyDeleteArchivedEntity('object', archiveName);
    expect(vault.files.has(`Ownly/Archive/Objects/${archiveName}`)).toBe(false);
    expect(await repository.listArchivedEntities()).toHaveLength(0);
  });

  it('round-trips reviews with their target link', async () => {
    const { vault, repository } = setup();
    const fileName = await repository.saveReview(review(), 'Review body');
    expect(fileName).toBe('review--2026-08-01--travel-camera-review.md');

    const [entry] = await repository.listReviews();
    expect(entry.entity.target_id).toBe('object-physical-1');
    expect(entry.entity.review_type).toBe('object_review');
    expect(vault.files.has(`Ownly/Reviews/${fileName}`)).toBe(true);
  });
});
