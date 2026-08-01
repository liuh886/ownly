import {
  Notice,
  Plugin,
  TFile,
  TFolder,
  normalizePath,
} from 'obsidian';
import {
  createOwnlyBackup,
  migrateOwnlyBackup,
  parseOwnlyBackup,
  planOwnlyRestore,
  restoreOwnlyBackup,
  serializeOwnlyBackup,
  validateOwnlyBackup,
  type OwnlyBackupBundle,
} from '../core/data-portability';
import { WYQD_CORE_TARGET_VERSION } from '../core/runtime';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { ObsidianOwnlyTextFileAdapter } from './ObsidianOwnlyTextFileAdapter';

const BACKUP_FOLDER = '.ownly-backups';

function token(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function ensureVaultFolder(plugin: Plugin, path: string): Promise<void> {
  const normalized = normalizePath(path);
  if (!normalized || plugin.app.vault.getAbstractFileByPath(normalized)) return;
  const parent = normalized.includes('/')
    ? normalized.slice(0, normalized.lastIndexOf('/'))
    : '';
  if (parent) await ensureVaultFolder(plugin, parent);
  try {
    await plugin.app.vault.createFolder(normalized);
  } catch (error) {
    if (!(plugin.app.vault.getAbstractFileByPath(normalized) instanceof TFolder)) throw error;
  }
}

async function writeBackupFile(
  plugin: Plugin,
  fileName: string,
  bundle: OwnlyBackupBundle,
): Promise<string> {
  await ensureVaultFolder(plugin, BACKUP_FOLDER);
  const path = normalizePath(`${BACKUP_FOLDER}/${fileName}`);
  const content = serializeOwnlyBackup(bundle);
  const existing = plugin.app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) await plugin.app.vault.modify(existing, content);
  else if (existing) throw new Error(`Backup path is not a file: ${path}`);
  else await plugin.app.vault.create(path, content);
  return path;
}

function latestUserBackup(plugin: Plugin): TFile | null {
  const prefix = `${BACKUP_FOLDER}/ownly-backup-`;
  return plugin.app.vault.getFiles()
    .filter((file) => file.path.startsWith(prefix) && file.extension === 'json')
    .sort((left, right) => right.path.localeCompare(left.path))[0] ?? null;
}

async function readBackup(plugin: Plugin, file: TFile): Promise<OwnlyBackupBundle> {
  const bundle = parseOwnlyBackup(await plugin.app.vault.read(file));
  const validation = await validateOwnlyBackup(bundle);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join('; '));
  }
  return bundle;
}

function runCommand(action: () => Promise<void>): void {
  void action().catch((error: unknown) => {
    new Notice(`Ownly: ${error instanceof Error ? error.message : String(error)}`);
  });
}

export function registerDataPortabilityCommands(
  plugin: Plugin,
  getDataFolder: () => string,
): void {
  plugin.addCommand({
    id: 'ownly-create-local-backup',
    name: 'Create local data backup',
    callback: () => runCommand(async () => {
      const now = new Date();
      const adapter = new ObsidianOwnlyTextFileAdapter(plugin.app, getDataFolder());
      const bundle = await createOwnlyBackup(
        adapter,
        { runtime: 'obsidian', ownly_version: WYQD_CORE_TARGET_VERSION },
        now,
      );
      const path = await writeBackupFile(
        plugin,
        `ownly-backup-${token(now)}.json`,
        bundle,
      );
      new Notice(`Ownly backup created: ${path} (${bundle.files.length} files)`);
    }),
  });

  plugin.addCommand({
    id: 'ownly-validate-latest-backup',
    name: 'Validate latest local backup',
    callback: () => runCommand(async () => {
      const file = latestUserBackup(plugin);
      if (!file) throw new Error(`No backup found in ${BACKUP_FOLDER}`);
      const bundle = await readBackup(plugin, file);
      new Notice(
        `Ownly backup valid: ${file.path} · ${bundle.files.length} files · schema ${bundle.dataset_schema_version}`,
      );
    }),
  });

  plugin.addCommand({
    id: 'ownly-restore-latest-backup',
    name: 'Restore latest local backup (no conflicts)',
    callback: () => runCommand(async () => {
      const file = latestUserBackup(plugin);
      if (!file) throw new Error(`No backup found in ${BACKUP_FOLDER}`);
      const bundle = await readBackup(plugin, file);
      const adapter = new ObsidianOwnlyTextFileAdapter(plugin.app, getDataFolder());
      const plan = await planOwnlyRestore(bundle, adapter, 'reject');
      if (!plan.can_apply) {
        throw new Error(
          `${plan.conflicts} conflicts found. Use “Restore latest local backup with overwrite” after reviewing the backup.`,
        );
      }
      const result = await restoreOwnlyBackup(bundle, adapter, { collisionPolicy: 'reject' });
      new Notice(`Ownly restore completed and verified: ${result.verified.length} files`);
    }),
  });

  plugin.addCommand({
    id: 'ownly-restore-latest-backup-overwrite',
    name: 'Restore latest local backup with overwrite',
    callback: () => runCommand(async () => {
      const file = latestUserBackup(plugin);
      if (!file) throw new Error(`No backup found in ${BACKUP_FOLDER}`);
      const bundle = await readBackup(plugin, file);
      const adapter = new ObsidianOwnlyTextFileAdapter(plugin.app, getDataFolder());
      const plan = await planOwnlyRestore(bundle, adapter, 'overwrite');

      new ConfirmationModal(plugin.app, {
        title: 'Restore Ownly backup with overwrite?',
        message: `${plan.creates} files will be created and ${plan.overwrites} conflicting files will be replaced.`,
        warningText: 'A complete safety backup will be saved in .ownly-backups before any file is overwritten.',
        confirmText: 'Create safety backup and restore',
        onConfirm: async () => {
          const now = new Date();
          const safety = await createOwnlyBackup(
            adapter,
            { runtime: 'restore-safety', ownly_version: WYQD_CORE_TARGET_VERSION },
            now,
          );
          const safetyPath = await writeBackupFile(
            plugin,
            `ownly-safety-backup-${token(now)}.json`,
            safety,
          );
          const result = await restoreOwnlyBackup(bundle, adapter, {
            collisionPolicy: 'overwrite',
            safetyBackup: safety,
          });
          new Notice(
            `Ownly restore completed and verified: ${result.verified.length} files. Safety backup: ${safetyPath}`,
          );
        },
      }).open();
    }),
  });

  plugin.addCommand({
    id: 'ownly-migrate-local-data',
    name: 'Check and migrate local data',
    callback: () => runCommand(async () => {
      const now = new Date();
      const adapter = new ObsidianOwnlyTextFileAdapter(plugin.app, getDataFolder());
      const original = await createOwnlyBackup(
        adapter,
        { runtime: 'obsidian', ownly_version: WYQD_CORE_TARGET_VERSION },
        now,
      );
      const migration = await migrateOwnlyBackup(original);
      if (migration.applied_steps.length === 0) {
        new Notice(`Ownly data is current: schema ${migration.to_version}`);
        return;
      }

      new ConfirmationModal(plugin.app, {
        title: 'Migrate Ownly local data?',
        message: `${migration.applied_steps.length} migration step(s) will change ${migration.changes.length} file entries.`,
        warningText: 'A complete pre-migration backup will be saved in .ownly-backups first.',
        confirmText: 'Create backup and migrate',
        onConfirm: async () => {
          const backupPath = await writeBackupFile(
            plugin,
            `ownly-pre-migration-${token(now)}.json`,
            original,
          );
          const result = await restoreOwnlyBackup(
            migration.migrated_bundle,
            adapter,
            { collisionPolicy: 'overwrite', safetyBackup: original },
          );
          new Notice(
            `Ownly migration completed and verified: ${result.verified.length} files. Backup: ${backupPath}`,
          );
        },
      }).open();
    }),
  });
}
