import {
  App,
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from 'obsidian';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  createWYQDTranslator,
  normalizeWYQDLanguage,
  WYQD_LANGUAGE_LABELS,
  type WYQDLanguage,
  type WYQDTranslationKey,
} from '@/core/i18n';
import { GUMROAD_STORE_URL } from '@/core/activation';
import { resolveWYQDMembership } from '@/core/membership';
import { WYQD_CORE_TARGET_VERSION, WYQD_PRODUCT_SLOGAN, WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { runWYQDDoctor } from '@/core/doctor';
import type { AccountSnapshot, ReviewEntry, WYQDObject } from '@/domain/types';
import { ObsidianVaultRepository } from './vaultRepository';
import { ObsidianWorkspaceProvider } from './ObsidianWorkspaceProvider';
import { AppShell } from '@/components/app-shell/AppShell';

const WYQD_VIEW_TYPE = 'wyqd-workspace';

interface WYQDPluginSettings {
  dataFolder: string;
  licenseKey: string;
  proUnlocked: boolean;
  licenseSource: 'gumroad' | 'special' | 'test' | '';
  licenseKeyLast4: string;
  activatedAt: string;
  lastVerifiedVersion: string;
  language: WYQDLanguage;
  openInRightSidebar: boolean;
}

const DEFAULT_SETTINGS: WYQDPluginSettings = {
  dataFolder: 'Ownly',
  licenseKey: '',
  proUnlocked: false,
  licenseSource: '',
  licenseKeyLast4: '',
  activatedAt: '',
  lastVerifiedVersion: '',
  language: 'en',
  openInRightSidebar: false,
};

type DraftKind = 'object' | 'snapshot' | 'review';

const WYQD_ENTITY_SUBFOLDERS: Record<DraftKind | 'account', string> = {
  object: 'Objects',
  account: 'Accounts',
  snapshot: 'Snapshots',
  review: 'Reviews',
};

export default class WYQDPlugin extends Plugin {
  settings: WYQDPluginSettings = DEFAULT_SETTINGS;
  repository!: ObsidianVaultRepository;
  private workspaceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private commandDefs: Record<string, { key: WYQDTranslationKey; callback: () => void }> = {};

  async onload() {
    await this.loadSettings();

    this.repository = new ObsidianVaultRepository(this.app, {
      dataFolder: () => this.settings.dataFolder,
    });

    this.registerView(WYQD_VIEW_TYPE, (leaf) => new WYQDWorkspaceView(leaf, this));

    // Refresh workspace when vault files change under the data folder
    this.registerEvent(
      this.app.vault.on('create', (file) => this.onVaultFileChange(file.path)),
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => this.onVaultFileChange(file.path)),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => this.onVaultFileChange(file.path)),
    );
    this.registerEvent(
      this.app.vault.on('rename', (file) => this.onVaultFileChange(file.path)),
    );

    this.addRibbonIcon('wallet-cards', this.t('openWorkspace'), () => {
      void this.activateView();
    });

    this.commandDefs = {
      'open-workspace': { key: 'openWorkspace', callback: () => void this.activateView() },
      'create-object': { key: 'createObjectCommand', callback: () => void this.createDraft('object') },
      'create-account-snapshot': { key: 'createSnapshotCommand', callback: () => void this.createDraft('snapshot') },
      'create-review': { key: 'createReviewCommand', callback: () => void this.createDraft('review') },
      'run-doctor': { key: 'runDoctorCommand', callback: () => void this.runDoctor() },
    };

    for (const [id, def] of Object.entries(this.commandDefs)) {
      this.addCommand({ id, name: this.t(def.key), callback: def.callback });
    }

    this.addSettingTab(new WYQDSettingTab(this.app, this));
  }

  onunload() {
    if (this.workspaceRefreshTimer) {
      clearTimeout(this.workspaceRefreshTimer);
      this.workspaceRefreshTimer = null;
    }
    this.app.workspace.getLeavesOfType(WYQD_VIEW_TYPE).forEach((leaf) => leaf.detach());
  }

  async activateView() {
    const existingLeaf = this.app.workspace.getLeavesOfType(WYQD_VIEW_TYPE)[0];
    if (existingLeaf) {
      await this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = this.settings.openInRightSidebar
      ? this.app.workspace.getRightLeaf(false)
      : this.app.workspace.getLeaf(true);

    if (!leaf) {
      new Notice(this.t('couldNotOpenWorkspace'));
      return;
    }

    await leaf.setViewState({ type: WYQD_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async createDraft(kind: DraftKind) {
    await this.ensureDataFolders();

    const now = new Date();
    const date = toDate(now);
    const t = (key: WYQDTranslationKey) => this.t(key);
    const draft = buildDraft(kind, now, t);
    const folder = this.getEntityFolder(kind);
    const path = await this.nextAvailablePath(`${folder}/${date}-${draft.id}.md`);

    await this.app.vault.create(path, draft.content);
    new Notice(this.t('objectCreated').replace('{title}', draft.title));
  }

  async runDoctor() {
    const report = await runWYQDDoctor(this.repository, undefined, (key) => this.t(key as WYQDTranslationKey));
    const findingsSummary = this.t('doctorFindings')
      .replace('{errors}', String(report.summary.error))
      .replace('{warnings}', String(report.summary.warning))
      .replace('{info}', String(report.summary.info));
    const lines = [
      `${this.t('doctorPluginVersion')} ${this.manifest.version}`,
      `${this.t('doctorRunAt')} ${toTimestamp(new Date(report.checkedAt))}`,
      findingsSummary,
      ...(report.findings.length === 0
        ? [this.t('doctorNoFindings')]
        : report.findings.slice(0, 6).map((finding) => `${finding.severity}: ${finding.message}`)),
    ];

    new Notice(`Ownly Doctor:\n${lines.join('\n')}`, 8000);
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<WYQDPluginSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      language: normalizeWYQDLanguage(data?.language),
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async getMembership() {
    return resolveWYQDMembership({
      proUnlocked: this.settings.proUnlocked,
      t: (key: string) => this.t(key as WYQDTranslationKey),
    });
  }

  t(key: WYQDTranslationKey) {
    return createWYQDTranslator(this.settings.language).t(key);
  }

  refreshWorkspaceViews() {
    this.app.workspace.getLeavesOfType(WYQD_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof WYQDWorkspaceView) {
        leaf.view.refresh();
      }
    });
  }

  refreshCommands() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = (this.app as any).commands?.commands;
    for (const [id, def] of Object.entries(this.commandDefs)) {
      if (registry) delete registry[id];
      this.addCommand({ id, name: this.t(def.key), callback: def.callback });
    }
  }

  private onVaultFileChange(filePath: string) {
    const dataFolder = normalizeFolder(this.settings.dataFolder) || DEFAULT_SETTINGS.dataFolder;
    if (filePath !== dataFolder && !filePath.startsWith(`${dataFolder}/`)) return;
    this.scheduleWorkspaceRefresh();
  }

  private scheduleWorkspaceRefresh() {
    if (this.workspaceRefreshTimer) {
      clearTimeout(this.workspaceRefreshTimer);
    }

    this.workspaceRefreshTimer = setTimeout(() => {
      this.workspaceRefreshTimer = null;
      this.refreshWorkspaceViews();
    }, 200);
  }

  private getEntityFolder(kind: DraftKind) {
    return `${this.settings.dataFolder}/${WYQD_ENTITY_SUBFOLDERS[kind]}`;
  }

  private async ensureDataFolders() {
    await this.ensureFolder(this.settings.dataFolder);
    await this.ensureFolder(this.getEntityFolder('object'));
    await this.ensureFolder(`${this.settings.dataFolder}/${WYQD_ENTITY_SUBFOLDERS.account}`);
    await this.ensureFolder(this.getEntityFolder('snapshot'));
    await this.ensureFolder(this.getEntityFolder('review'));
  }

  private async ensureFolder(path: string) {
    if (!(await this.app.vault.adapter.exists(path))) {
      await this.app.vault.createFolder(path);
    }
  }

  private async nextAvailablePath(path: string) {
    if (!(await this.app.vault.adapter.exists(path))) {
      return path;
    }

    const extensionIndex = path.lastIndexOf('.');
    const base = extensionIndex >= 0 ? path.slice(0, extensionIndex) : path;
    const extension = extensionIndex >= 0 ? path.slice(extensionIndex) : '';

    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${base}-${index}${extension}`;
      if (!(await this.app.vault.adapter.exists(candidate))) {
        return candidate;
      }
    }

    throw new Error(`Could not find available path for ${path}`);
  }
}

class WYQDWorkspaceView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: WYQDPlugin,
  ) {
    super(leaf);
  }

  getViewType() {
    return WYQD_VIEW_TYPE;
  }

  getDisplayText() {
    return this.plugin.t('workspaceTitle');
  }

  getIcon() {
    return 'wallet-cards';
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('wyqd-obsidian-view');
    this.contentEl.addClass('wyqd-runtime-obsidian');
    await this.mountReact();
  }

  async mountReact() {
    try {
      const membership = await this.plugin.getMembership();
      this.root = createRoot(this.contentEl);
      this.root.render(
        createElement(
          ObsidianWorkspaceProvider,
          {
            repository: this.plugin.repository,
            membership,
            language: this.plugin.settings.language,
            onLanguageChange: (lang: WYQDLanguage) => {
              this.plugin.settings.language = lang;
              void this.plugin.saveSettings();
            },
            onRefresh: () => {
              this.plugin.refreshWorkspaceViews();
            },
          },
          createElement(AppShell),
        ),
      );
    } catch (error) {
      this.renderError(error);
    }
  }

  private renderError(error: unknown) {
    const shell = this.contentEl.createDiv({ cls: 'wyqd-shell' });
    const panel = shell.createDiv({ cls: 'wyqd-error-panel' });
    panel.createEl('h2', { text: this.plugin.t('loadErrorTitle') });
    panel.createEl('p', { text: getErrorMessage(error) });
    const btn = panel.createDiv({ cls: 'wyqd-detail-actions' }).createEl('button', { text: this.plugin.t('tryAgain'), cls: 'mod-cta' });
    btn.type = 'button';
    btn.addEventListener('click', () => {
      this.contentEl.empty();
      this.contentEl.addClass('wyqd-obsidian-view');
      this.mountReact();
    });
  }

  refresh() {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
    this.contentEl.addClass('wyqd-obsidian-view');
    void this.mountReact();
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}

class WYQDSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly wyqdPlugin: WYQDPlugin,
  ) {
    super(app, wyqdPlugin);
  }

  async display() {
    const { containerEl } = this;
    const t = (key: WYQDTranslationKey) => this.wyqdPlugin.t(key);
    containerEl.empty();
    containerEl.addClass('wyqd-settings-view');
    const membership = await this.wyqdPlugin.getMembership();

    const shell = containerEl.createDiv({ cls: 'wyqd-settings-shell' });
    const hero = shell.createDiv({ cls: 'wyqd-settings-hero' });
    const heroCopy = hero.createDiv();
    const eyebrow = heroCopy.createDiv({ cls: 'wyqd-eyebrow' });
    eyebrow.createEl('span', { text: `Ownly ${WYQD_CORE_TARGET_VERSION}` });
    eyebrow.createEl('span', { text: t('localVaultOnly') });
    heroCopy.createEl('h2', { text: 'Ownly' });
    heroCopy.createEl('p', { text: t('workspaceSubtitle') });
    heroCopy.createEl('p', { cls: 'wyqd-slogan', text: WYQD_PRODUCT_SLOGAN });
    const membershipCard = hero.createDiv({ cls: 'wyqd-settings-membership' });
    membershipCard.createEl('span', { text: t('membership') });
    membershipCard.createEl('strong', { text: membership.planLabel });
    membershipCard.createEl('small', { text: membership.statusLabel });

    const appPanel = shell.createDiv({ cls: 'wyqd-settings-panel' });
    const appHeader = appPanel.createDiv({ cls: 'wyqd-section-header' });
    appHeader.createEl('h3', { text: t('workspaceTitle') });
    appHeader.createEl('p', { text: t('settingsDataFolderDesc') });

    new Setting(appPanel)
      .setName(t('settingsLanguage'))
      .setDesc(t('settingsLanguageDesc'))
      .addDropdown((dropdown) => {
        Object.entries(WYQD_LANGUAGE_LABELS).forEach(([value, label]) => {
          dropdown.addOption(value, label);
        });
        dropdown.setValue(this.wyqdPlugin.settings.language).onChange(async (value) => {
          this.wyqdPlugin.settings.language = normalizeWYQDLanguage(value);
          await this.wyqdPlugin.saveSettings();
          this.wyqdPlugin.refreshWorkspaceViews();
          this.wyqdPlugin.refreshCommands();
          await this.display();
        });
      });

    new Setting(appPanel)
      .setName(t('settingsDataFolder'))
      .setDesc(t('settingsDataFolderDesc'))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dataFolder)
          .setValue(this.wyqdPlugin.settings.dataFolder)
          .onChange(async (value) => {
            this.wyqdPlugin.settings.dataFolder = normalizeFolder(value) || DEFAULT_SETTINGS.dataFolder;
            await this.wyqdPlugin.saveSettings();
          }),
      );

    new Setting(appPanel)
      .setName(t('settingsRightSidebar'))
      .setDesc(t('settingsRightSidebarDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.wyqdPlugin.settings.openInRightSidebar).onChange(async (value) => {
          this.wyqdPlugin.settings.openInRightSidebar = value;
          await this.wyqdPlugin.saveSettings();
        }),
      );

    // ── Membership panel ──
    const membershipPanel = shell.createDiv({ cls: 'wyqd-settings-panel' });
    const membershipHeader = membershipPanel.createDiv({ cls: 'wyqd-section-header' });
    membershipHeader.createEl('h3', { text: t('activationTitle') });
    membershipHeader.createEl('p', { text: t('activationDesc') });

    if (membership.isPro) {
      // Pro unlocked — show status + sponsor link
      const activeBanner = membershipPanel.createDiv({ cls: 'wyqd-settings-active-banner' });
      activeBanner.createEl('span', { text: `${t('activationActive')} — ${membership.planLabel}` });

      new Setting(membershipPanel)
        .setName(t('plan'))
        .setDesc(`${membership.planLabel} — ${membership.statusLabel}`);

      // Sponsor link
      const sponsorRow = membershipHeader.createDiv({ cls: 'wyqd-settings-cta-row' });
      const sponsorLink = sponsorRow.createEl('a', {
        text: t('sponsorButton'),
        href: GUMROAD_STORE_URL,
      });
      sponsorLink.setAttr('target', '_blank');
      sponsorLink.setAttr('rel', 'noopener noreferrer');

      // Return to Free
      new Setting(membershipPanel)
        .setName(t('activationDeactivate'))
        .setDesc(t('licenseModalClearDesc'))
        .addButton((button) =>
          button
            .setButtonText(t('activationDeactivate'))
            .setWarning()
            .onClick(async () => {
              this.wyqdPlugin.settings.proUnlocked = false;
              await this.wyqdPlugin.saveSettings();
              this.wyqdPlugin.refreshWorkspaceViews();
              new Notice(t('activationDeactivated'));
              await this.display();
            }),
        );
    } else {
      // Not yet unlocked — show activation input + button
      const DEFAULT_ACTIVATION_CODE = 'OWNLY-PRO-2024-FREE-X8K2';
      let pendingLicenseKey = this.wyqdPlugin.settings.licenseKey || DEFAULT_ACTIVATION_CODE;

      const keySetting = new Setting(membershipPanel)
        .setName(t('settingsLicenseKey'))
        .setDesc(t('settingsActivationHint'));

      keySetting.addText((text) => {
        text.inputEl.style.flex = '1';
        text.inputEl.style.fontFamily = 'monospace';
        text
          .setPlaceholder(DEFAULT_ACTIVATION_CODE)
          .setValue(pendingLicenseKey)
          .onChange((value) => {
            pendingLicenseKey = value;
          });
      });

      keySetting.addButton((button) =>
        button
          .setButtonText(t('licenseModalActivate'))
          .setCta()
          .onClick(async () => {
            // No verification — just unlock
            this.wyqdPlugin.settings.licenseKey = pendingLicenseKey.trim() || 'OWNLY-PRO';
            this.wyqdPlugin.settings.proUnlocked = true;
            this.wyqdPlugin.settings.licenseSource = 'gumroad';
            this.wyqdPlugin.settings.licenseKeyLast4 = this.wyqdPlugin.settings.licenseKey.slice(-4);
            this.wyqdPlugin.settings.activatedAt = new Date().toISOString();
            await this.wyqdPlugin.saveSettings();
            this.wyqdPlugin.refreshWorkspaceViews();
            new Notice(t('activationSuccess'));
            // Open Gumroad sponsor link after activation
            window.open(GUMROAD_STORE_URL, '_blank');
            await this.display();
          }),
      );

      new Setting(membershipPanel)
        .setName(t('plan'))
        .setDesc(`${membership.planLabel} — ${membership.statusLabel}`);
    }
  }
}

function buildDraft(kind: DraftKind, now: Date, t: (key: WYQDTranslationKey) => string): { id: string; title: string; content: string } {
  if (kind === 'object') {
    const entity: WYQDObject = {
      schema_version: WYQD_SCHEMA_VERSION,
      id: `obj_${toCompactTimestamp(now)}`,
      type: 'object',
      object_type: 'physical',
      title: t('untitledObject'),
      status: 'seeded',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      currency: 'CNY',
      tags: ['ownly', 'object'],
      include_in_net_worth: false,
      default_depreciates_to_zero: true,
    };
    return renderDraft(entity.id, entity.title, entity, t('objectDraftBody'));
  }

  if (kind === 'snapshot') {
    const snapshotTitle = t('snapshotDraftTitle').replace('{date}', toDate(now));
    const entity: AccountSnapshot = {
      schema_version: WYQD_SCHEMA_VERSION,
      id: `snap_${toCompactTimestamp(now)}`,
      type: 'snapshot',
      snapshot_type: 'net_worth',
      title: snapshotTitle,
      snapshot_at: toDate(now),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      currency: 'CNY',
      tags: ['ownly', 'snapshot'],
      asset_balances: [],
      liability_balances: [],
    };
    return renderDraft(entity.id, entity.title, entity, t('snapshotDraftBody'));
  }

  const reviewTitle = t('reviewDraftTitle').replace('{date}', toDate(now));
  const entity: ReviewEntry = {
    schema_version: WYQD_SCHEMA_VERSION,
    id: `review_${toCompactTimestamp(now)}`,
    type: 'review',
    review_type: 'object_review',
    title: reviewTitle,
    reviewed_at: toDate(now),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    currency: 'CNY',
    tags: ['ownly', 'review'],
  };
  return renderDraft(entity.id, entity.title, entity, t('reviewDraftBody'));
}

function renderDraft(
  id: string,
  title: string,
  entity: WYQDObject | AccountSnapshot | ReviewEntry,
  prompt: string,
) {
  return {
    id,
    title,
    content: `---\n${toYaml(entity)}---\n\n# ${title}\n\n${prompt}\n`,
  };
}

function toYaml(value: WYQDObject | AccountSnapshot | ReviewEntry) {
  return Object.entries(value as unknown as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .map(([key, entryValue]) => `${key}: ${formatYamlValue(entryValue)}`)
    .join('\n')
    .concat('\n');
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(formatYamlValue).join(', ')}]`;
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  return JSON.stringify(String(value));
}

function normalizeFolder(value: string) {
  return value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function toDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toCompactTimestamp(value: Date) {
  return value.toISOString().replace(/\D/g, '').slice(0, 14);
}

function toTimestamp(value: Date) {
  return value.toISOString().replace('T', ' ').slice(0, 19);
}


function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error.';
}
