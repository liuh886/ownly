import {
  App,
  ItemView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';

import {
  createWYQDTranslator,
  normalizeWYQDLanguage,
  WYQD_LANGUAGE_LABELS,
  type WYQDLanguage,
  type WYQDTranslationKey,
} from '@/core/i18n';
import { normalizeWYQDLicenseKey, resolveWYQDMembership } from '@/core/membership';
import { createObjectConsoleModel } from '@/core/objectConsole';
import { WYQD_CORE_TARGET_VERSION, WYQD_PRODUCT_SLOGAN, WYQD_SCHEMA_VERSION } from '@/core/runtime';
import { runWYQDDoctor, type WYQDDoctorReport } from '@/core/doctor';
import type { Account, AccountSnapshot, PhysicalObject, RecurringCostObject, ReviewEntry, WYQDObject } from '@/domain/types';
import { calculateNetWorth, calculateRecurringMonthlyCost, findLatestSnapshot } from '@/domain/calculations';
import { ObsidianVaultRepository } from './vaultRepository';

const WYQD_VIEW_TYPE = 'wyqd-workspace';

interface WYQDPluginSettings {
  dataFolder: string;
  licenseKey: string;
  language: WYQDLanguage;
  openInRightSidebar: boolean;
}

const DEFAULT_SETTINGS: WYQDPluginSettings = {
  dataFolder: 'Ownly',
  licenseKey: '',
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

  async onload() {
    await this.loadSettings();
    this.repository = new ObsidianVaultRepository(this.app, {
      dataFolder: () => this.settings.dataFolder,
    });

    this.registerView(WYQD_VIEW_TYPE, (leaf) => new WYQDWorkspaceView(leaf, this));

    this.addRibbonIcon('wallet-cards', this.t('openWorkspace'), () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-workspace',
      name: this.t('openWorkspace'),
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: 'create-object',
      name: this.t('createObjectCommand'),
      callback: () => void this.createDraft('object'),
    });

    this.addCommand({
      id: 'create-account-snapshot',
      name: this.t('createSnapshotCommand'),
      callback: () => void this.createDraft('snapshot'),
    });

    this.addCommand({
      id: 'create-review',
      name: this.t('createReviewCommand'),
      callback: () => void this.createDraft('review'),
    });

    this.addCommand({
      id: 'run-doctor',
      name: this.t('runDoctorCommand'),
      callback: () => void this.runDoctor(),
    });

    this.addSettingTab(new WYQDSettingTab(this.app, this));
  }

  onunload() {
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
      new Notice('Ownly: Could not open workspace view.');
      return;
    }

    await leaf.setViewState({ type: WYQD_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async createDraft(kind: DraftKind) {
    await this.ensureDataFolders();

    const now = new Date();
    const date = toDate(now);
    const draft = buildDraft(kind, now);
    const folder = this.getEntityFolder(kind);
    const path = await this.nextAvailablePath(`${folder}/${date}-${draft.id}.md`);

    await this.app.vault.create(path, draft.content);
    new Notice(`Ownly: Created ${draft.title}`);
  }

  async runDoctor() {
    const report = await runWYQDDoctor(this.repository);
    const lines = [
      `Plugin version ${this.manifest.version}`,
      `Doctor run ${toTimestamp(new Date(report.checkedAt))}`,
      `Findings: ${report.summary.error} error, ${report.summary.warning} warning, ${report.summary.info} info`,
      ...report.findings.slice(0, 6).map((finding) => `${finding.severity}: ${finding.message}`),
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

  getMembership() {
    return resolveWYQDMembership({ licenseKey: this.settings.licenseKey });
  }

  t(key: WYQDTranslationKey) {
    return createWYQDTranslator(this.settings.language).t(key);
  }

  refreshWorkspaceViews() {
    this.app.workspace.getLeavesOfType(WYQD_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof WYQDWorkspaceView) {
        void leaf.view.render();
      }
    });
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
  private selectedObjectId: string | null = null;

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
    await this.render();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('wyqd-obsidian-view');

    try {
      await this.renderWorkspace(contentEl);
    } catch (error) {
      this.renderError(contentEl, error);
    }
  }

  private async renderWorkspace(contentEl: HTMLElement) {
    const t = (key: WYQDTranslationKey) => this.plugin.t(key);
    const membership = this.plugin.getMembership();
    const [objects, accounts, snapshots, reviews, archivedEntities, doctorReport] = await Promise.all([
      this.plugin.repository.listObjects(),
      this.plugin.repository.listAccounts(),
      this.plugin.repository.listSnapshots(),
      this.plugin.repository.listReviews(),
      this.plugin.repository.listArchivedEntities(),
      runWYQDDoctor(this.plugin.repository),
    ]);
    const objectConsole = createObjectConsoleModel(objects.map((stored) => stored.entity));

    const shell = contentEl.createDiv({ cls: 'wyqd-shell' });
    const header = shell.createDiv({ cls: 'wyqd-hero' });
    const heroCopy = header.createDiv({ cls: 'wyqd-hero-copy' });
    const eyebrow = heroCopy.createDiv({ cls: 'wyqd-eyebrow' });
    eyebrow.createEl('span', { text: `Ownly ${WYQD_CORE_TARGET_VERSION}` });
    eyebrow.createEl('span', { text: t('localVaultOnly') });
    heroCopy.createEl('h2', { text: t('workspaceTitle') });
    heroCopy.createEl('p', {
      text: t('workspaceSubtitle'),
    });
    heroCopy.createEl('p', {
      cls: 'wyqd-slogan',
      text: WYQD_PRODUCT_SLOGAN,
    });

    const heroMetrics = header.createDiv({ cls: 'wyqd-hero-metrics' });
    this.createStatusItem(heroMetrics, t('objects'), String(objectConsole.summary.total));
    this.createStatusItem(heroMetrics, t('active'), String(objectConsole.summary.active));
    this.createStatusItem(heroMetrics, t('review'), String(objectConsole.summary.review));

    this.renderHomeDashboard(shell, objects.map((s) => s.entity), snapshots.map((s) => s.entity), reviews.map((s) => s.entity), t);

    const actionsPanel = shell.createDiv({ cls: 'wyqd-actions-panel' });
    const actionsHeader = actionsPanel.createDiv({ cls: 'wyqd-section-header' });
    actionsHeader.createEl('h3', { text: t('quickActions') });
    const actions = actionsPanel.createDiv({ cls: 'wyqd-action-grid' });
    this.createActionCard(actions, t('refresh'), t('refreshDesc'), () => void this.render());
    this.createActionCard(actions, t('newObject'), t('newObjectDesc'), () => void this.plugin.createDraft('object'));
    this.createActionCard(actions, t('newSnapshot'), t('newSnapshotDesc'), () => void this.plugin.createDraft('snapshot'));
    this.createActionCard(actions, t('newReview'), t('newReviewDesc'), () => void this.plugin.createDraft('review'));
    this.createActionCard(actions, t('doctor'), t('doctorDesc'), () => void this.plugin.runDoctor());

    const grid = shell.createDiv({ cls: 'wyqd-status-grid wyqd-runtime-grid' });
    this.createStatusItem(grid, t('storage'), this.plugin.settings.dataFolder);
    this.createStatusItem(grid, t('mode'), t('localVaultOnly'));
    this.createStatusItem(grid, t('membership'), membership.planLabel);
    this.createStatusItem(grid, t('license'), membership.statusLabel);
    this.createStatusItem(grid, t('schema'), `${WYQD_SCHEMA_VERSION} shared core model`);
    this.createStatusItem(grid, t('release'), `Plugin ${this.plugin.manifest.version}`);
    this.createStatusItem(grid, t('target'), `Ownly ${WYQD_CORE_TARGET_VERSION}`);

    const workspaceGrid = shell.createDiv({ cls: 'wyqd-workspace-grid' });

    const consolePanel = workspaceGrid.createDiv({ cls: 'wyqd-console-panel' });
    const consoleHeader = consolePanel.createDiv({ cls: 'wyqd-section-header' });
    consoleHeader.createEl('h3', { text: t('objectConsole') });
    consoleHeader.createEl('p', {
      text: t('objectConsoleDesc'),
    });

    const consoleGrid = consolePanel.createDiv({ cls: 'wyqd-status-grid' });
    this.createStatusItem(consoleGrid, t('objects'), String(objectConsole.summary.total));
    this.createStatusItem(consoleGrid, t('pending'), String(objectConsole.summary.pending));
    this.createStatusItem(consoleGrid, t('active'), String(objectConsole.summary.active));
    this.createStatusItem(consoleGrid, t('review'), String(objectConsole.summary.review));
    this.createStatusItem(consoleGrid, t('closed'), String(objectConsole.summary.closed));
    this.createStatusItem(consoleGrid, t('archived'), String(archivedEntities.length));

    const priorityList = consolePanel.createDiv({ cls: 'wyqd-priority-list' });
    if (objectConsole.priorityItems.length === 0) {
      priorityList.createDiv({
        cls: 'wyqd-empty-state',
        text: t('noObjects'),
      });
    } else {
      objectConsole.priorityItems.forEach((item) => {
        const row = priorityList.createEl('button', { cls: 'wyqd-object-row' });
        row.type = 'button';
        row.toggleClass('is-selected', item.id === this.selectedObjectId);
        row.addEventListener('click', () => {
          this.selectedObjectId = item.id;
          void this.render();
        });
        const main = row.createDiv();
        main.createEl('strong', { text: item.title });
        main.createEl('span', { text: `${formatObjectType(item.objectType, t)} / ${item.status}` });
        row.createEl('span', { cls: `wyqd-bucket wyqd-bucket-${item.bucket}`, text: formatBucket(item.bucket, t) });
      });
    }

    const selectedObject =
      objects.find((stored) => stored.entity.id === this.selectedObjectId) ?? objects[0] ?? null;
    if (!this.selectedObjectId && selectedObject) {
      this.selectedObjectId = selectedObject.entity.id;
    }
    this.createObjectDetailPanel(workspaceGrid, selectedObject);
    this.createArchivedObjectsPanel(
      shell,
      archivedEntities.filter((entry) => entry.archiveType === 'object'),
    );

    const dataPanel = shell.createDiv({ cls: 'wyqd-data-panel' });
    this.createStatusItem(dataPanel, t('accounts'), String(accounts.length));
    this.createStatusItem(dataPanel, t('snapshots'), String(snapshots.length));
    this.createStatusItem(dataPanel, t('reviews'), String(reviews.length));

    this.createSecondaryDataPanel(shell, accounts, snapshots, reviews);
    this.renderReviewConsole(shell, reviews.map((s) => s.entity), objects.map((s) => s.entity), t);
    this.createDoctorPanel(shell, doctorReport);
    this.createProFeatureEntry(shell, membership);

    const note = shell.createDiv({ cls: 'wyqd-note' });
    note.createEl('strong', { text: t('alphaBoundary') });
    note.createEl('p', {
      text: t('alphaBoundaryDesc'),
    });
  }

  private renderError(contentEl: HTMLElement, error: unknown) {
    const shell = contentEl.createDiv({ cls: 'wyqd-shell' });
    const panel = shell.createDiv({ cls: 'wyqd-error-panel' });
    panel.createEl('h2', { text: this.plugin.t('loadErrorTitle') });
    panel.createEl('p', { text: getErrorMessage(error) });
    this.createActionButton(panel.createDiv({ cls: 'wyqd-detail-actions' }), this.plugin.t('tryAgain'), () => void this.render());
  }

  private renderHomeDashboard(
    shell: HTMLElement,
    objects: WYQDObject[],
    snapshots: AccountSnapshot[],
    reviews: ReviewEntry[],
    t: (key: WYQDTranslationKey) => string,
  ) {
    const panel = shell.createDiv({ cls: 'wyqd-detail-panel' });
    const header = panel.createDiv({ cls: 'wyqd-section-header' });
    header.createEl('h3', { text: t('tabHome') });
    header.createEl('p', { text: t('tabHomeDesc') });

    const metricsGrid = panel.createDiv({ cls: 'wyqd-status-grid' });

    const latestSnapshot = findLatestSnapshot(snapshots);
    if (latestSnapshot) {
      const netWorth = calculateNetWorth(latestSnapshot);
      this.createStatusItem(metricsGrid, t('netWorth'), formatMoney(netWorth.net_worth ?? 0));
    } else {
      this.createStatusItem(metricsGrid, t('netWorth'), t('noData'));
    }

    const activeRecurring = objects.filter((o) => o.object_type === 'recurring_cost' && o.status === 'active');
    const monthlyCost = activeRecurring.reduce((sum, o) => sum + calculateRecurringMonthlyCost(o as RecurringCostObject), 0);
    this.createStatusItem(metricsGrid, t('monthlyFixedCost'), formatMoney(monthlyCost));

    const observing = objects.filter((o) => o.object_type === 'physical' && o.status === 'observing');
    const observingAmount = observing.reduce((sum, o) => sum + ((o as PhysicalObject).purchase_price || 0), 0);
    this.createStatusItem(metricsGrid, t('observingDesire'), formatMoney(observingAmount));

    const owned = objects.filter((o) => o.object_type === 'physical' && ['purchased', 'using', 'idle'].includes(o.status));
    this.createStatusItem(metricsGrid, t('ownedPhysical'), String(owned.length));

    this.createStatusItem(metricsGrid, t('activeSubscription'), String(activeRecurring.length));

    const pendingReviews = objects.filter((o) => o.object_type === 'one_time_experience' && o.status === 'completed');
    this.createStatusItem(metricsGrid, t('pendingReview'), String(pendingReviews.length));

    if (snapshots.length >= 2) {
      const sorted = [...snapshots].sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at));
      const first = calculateNetWorth(sorted[0]);
      const last = calculateNetWorth(sorted[sorted.length - 1]);
      const delta = (last.net_worth ?? 0) - (first.net_worth ?? 0);
      this.createStatusItem(metricsGrid, t('netWorthTrend'), `${delta >= 0 ? '+' : ''}${formatMoney(delta)}`);
    }
  }

  private renderReviewConsole(
    shell: HTMLElement,
    reviews: ReviewEntry[],
    objects: WYQDObject[],
    t: (key: WYQDTranslationKey) => string,
  ) {
    const panel = shell.createDiv({ cls: 'wyqd-detail-panel' });
    const header = panel.createDiv({ cls: 'wyqd-section-header' });
    header.createEl('h3', { text: t('reviewConsole') });
    header.createEl('p', { text: t('reviewConsoleDesc') });

    const metricsGrid = panel.createDiv({ cls: 'wyqd-status-grid' });
    this.createStatusItem(metricsGrid, t('reviewCount'), String(reviews.length));

    const totalCost = reviews.reduce((sum, r) => sum + (r.realized_experience_cost || 0), 0);
    this.createStatusItem(metricsGrid, t('experienceCost'), formatMoney(totalCost));

    const pendingExperiences = objects.filter((o) => o.object_type === 'one_time_experience' && o.status === 'completed');
    this.createStatusItem(metricsGrid, t('pendingReview'), String(pendingExperiences.length));

    const crystallized = reviews.filter((r) => r.food_rank || r.scenery_rank || r.experience_rank);
    this.createStatusItem(metricsGrid, t('crystallized'), String(crystallized.length));

    if (reviews.length === 0) {
      panel.createDiv({ cls: 'wyqd-empty-state', text: t('noPendingReviews') });
      return;
    }

    const rankingSection = panel.createDiv({ cls: 'wyqd-priority-list' });
    const rankingHeader = rankingSection.createDiv({ cls: 'wyqd-section-header' });
    rankingHeader.createEl('h4', { text: t('rankings') });

    const recentReviews = [...reviews]
      .sort((a, b) => (b.reviewed_at || b.created_at).localeCompare(a.reviewed_at || a.created_at))
      .slice(0, 5);

    recentReviews.forEach((review) => {
      const row = rankingSection.createDiv({ cls: 'wyqd-object-row' });
      const main = row.createDiv();
      main.createEl('strong', { text: review.title });
      const meta = main.createEl('span');
      if (review.food_rank) meta.createEl('span', { text: `${t('foodRank')} #${review.food_rank} ` });
      if (review.scenery_rank) meta.createEl('span', { text: `${t('sceneryRank')} #${review.scenery_rank} ` });
      if (review.experience_rank) meta.createEl('span', { text: `${t('experienceRank')} #${review.experience_rank}` });
      if (!review.food_rank && !review.scenery_rank && !review.experience_rank) {
        meta.setText(t('notRanked'));
      }
      if (review.realized_experience_cost) {
        row.createEl('span', { cls: 'wyqd-bucket', text: formatMoney(review.realized_experience_cost) });
      }
    });
  }

  async onClose() {
    this.contentEl.empty();
  }

  private createActionButton(parent: HTMLElement, label: string, callback: () => void) {
    const button = parent.createEl('button', { text: label, cls: 'mod-cta' });
    button.type = 'button';
    button.addEventListener('click', callback);
  }

  private createActionCard(parent: HTMLElement, label: string, detail: string, callback: () => void) {
    const button = parent.createEl('button', { cls: 'wyqd-action-card' });
    button.type = 'button';
    button.addEventListener('click', callback);
    button.createEl('strong', { text: label });
    button.createEl('span', { text: detail });
  }

  private createStatusItem(parent: HTMLElement, label: string, value: string) {
    const item = parent.createDiv({ cls: 'wyqd-status-item' });
    item.createEl('span', { text: label });
    item.createEl('strong', { text: value });
  }

  private createObjectDetailPanel(
    parent: HTMLElement,
    stored: Awaited<ReturnType<ObsidianVaultRepository['listObjects']>>[number] | null,
  ) {
    const t = (key: WYQDTranslationKey) => this.plugin.t(key);
    const panel = parent.createDiv({ cls: 'wyqd-detail-panel' });
    const header = panel.createDiv({ cls: 'wyqd-section-header' });
    header.createEl('h3', { text: t('objectDetail') });
    header.createEl('p', {
      text: t('objectDetailDesc'),
    });

    if (!stored) {
      panel.createDiv({
        cls: 'wyqd-empty-state',
        text: t('noObjectSelected'),
      });
      return;
    }

    const object = stored.entity;
    const detailGrid = panel.createDiv({ cls: 'wyqd-detail-grid' });
    this.createStatusItem(detailGrid, t('title'), object.title);
    this.createStatusItem(detailGrid, t('type'), formatObjectType(object.object_type, t));
    this.createStatusItem(detailGrid, t('status'), object.status);
    this.createStatusItem(detailGrid, t('updated'), object.updated_at ?? object.created_at);
    this.createStatusItem(detailGrid, t('file'), stored.path ?? stored.fileName);

    const body = panel.createEl('pre', { cls: 'wyqd-body-preview' });
    body.setText((stored.body || t('noBody')).trim().slice(0, 1200));

    const form = panel.createDiv({ cls: 'wyqd-edit-form' });
    const titleInput = this.createTextField(form, t('title'), object.title);
    const categoryInput = this.createTextField(form, t('category'), object.category ?? '');
    const notesInput = this.createTextArea(form, t('notes'), object.notes ?? '');
    const statusSelect = this.createStatusSelect(form, object);

    const actions = panel.createDiv({ cls: 'wyqd-detail-actions' });
    this.createActionButton(actions, t('saveFields'), () =>
      void this.saveObjectFields(stored, {
        title: titleInput.value.trim() || object.title,
        category: categoryInput.value.trim() || undefined,
        notes: notesInput.value.trim() || undefined,
        status: statusSelect.value as WYQDObject['status'],
      }),
    );
    this.createActionButton(actions, t('openMarkdown'), () => void this.openMarkdownFile(stored.path));
    this.createActionButton(actions, t('advanceStatus'), () => void this.advanceObjectStatus(stored));
    this.createActionButton(actions, t('archiveObject'), () => void this.archiveObject(stored.fileName));
  }

  private createArchivedObjectsPanel(
    parent: HTMLElement,
    archivedObjects: Awaited<ReturnType<ObsidianVaultRepository['listArchivedEntities']>>,
  ) {
    const t = (key: WYQDTranslationKey) => this.plugin.t(key);
    const panel = parent.createDiv({ cls: 'wyqd-detail-panel' });
    const header = panel.createDiv({ cls: 'wyqd-section-header' });
    header.createEl('h3', { text: t('archivedObjects') });
    header.createEl('p', {
      text: t('archivedObjectsDesc'),
    });

    if (archivedObjects.length === 0) {
      panel.createDiv({ cls: 'wyqd-empty-state', text: t('noArchivedObjects') });
      return;
    }

    const list = panel.createDiv({ cls: 'wyqd-priority-list' });
    archivedObjects.slice(0, 6).forEach((stored) => {
      const row = list.createDiv({ cls: 'wyqd-object-row wyqd-archive-row' });
      const main = row.createDiv();
      main.createEl('strong', { text: stored.entity.title });
      main.createEl('span', { text: stored.path ?? stored.fileName });
      const button = row.createEl('button', { text: t('restore') });
      button.type = 'button';
      button.addEventListener('click', () => void this.restoreObject(stored.fileName));
    });
  }

  private createSecondaryDataPanel(
    parent: HTMLElement,
    accounts: Awaited<ReturnType<ObsidianVaultRepository['listAccounts']>>,
    snapshots: Awaited<ReturnType<ObsidianVaultRepository['listSnapshots']>>,
    reviews: Awaited<ReturnType<ObsidianVaultRepository['listReviews']>>,
  ) {
    const t = (key: WYQDTranslationKey) => this.plugin.t(key);
    const panel = parent.createDiv({ cls: 'wyqd-detail-panel' });
    const header = panel.createDiv({ cls: 'wyqd-section-header' });
    header.createEl('h3', { text: t('secondaryData') });
    header.createEl('p', {
      text: t('secondaryDataDesc'),
    });

    const columns = panel.createDiv({ cls: 'wyqd-secondary-grid' });
    this.createRecordColumn(columns, t('accounts'), accounts.slice(0, 5));
    this.createRecordColumn(columns, t('snapshots'), snapshots.slice(0, 5));
    this.createRecordColumn(columns, t('reviews'), reviews.slice(0, 5));
  }

  private createRecordColumn<T extends Account | AccountSnapshot | ReviewEntry>(
    parent: HTMLElement,
    title: string,
    records: ReadonlyArray<{ fileName: string; path?: string; entity: T }>,
  ) {
    const column = parent.createDiv({ cls: 'wyqd-record-column' });
    column.createEl('h4', { text: title });

    if (records.length === 0) {
      column.createDiv({ cls: 'wyqd-empty-state', text: this.plugin.t('noRecords') });
      return;
    }

    records.forEach((stored) => {
      const row = column.createDiv({ cls: 'wyqd-record-row' });
      const main = row.createDiv();
      main.createEl('strong', { text: stored.entity.title });
      main.createEl('span', { text: stored.path ?? stored.fileName });
      const button = row.createEl('button', { text: this.plugin.t('open') });
      button.type = 'button';
      button.addEventListener('click', () => void this.openMarkdownFile(stored.path));
    });
  }

  private createDoctorPanel(parent: HTMLElement, report: WYQDDoctorReport) {
    const t = (key: WYQDTranslationKey) => this.plugin.t(key);
    const panel = parent.createDiv({ cls: 'wyqd-detail-panel' });
    const header = panel.createDiv({ cls: 'wyqd-section-header' });
    header.createEl('h3', { text: 'Doctor' });
    header.createEl('p', {
      text: `Checked ${toTimestamp(new Date(report.checkedAt))}.`,
    });

    const grid = panel.createDiv({ cls: 'wyqd-status-grid' });
    this.createStatusItem(grid, t('errors'), String(report.summary.error));
    this.createStatusItem(grid, t('warnings'), String(report.summary.warning));
    this.createStatusItem(grid, t('info'), String(report.summary.info));

    if (report.findings.length === 0) {
      panel.createDiv({ cls: 'wyqd-empty-state', text: t('noDoctorFindings') });
      return;
    }

    const list = panel.createDiv({ cls: 'wyqd-priority-list' });
    report.findings.slice(0, 8).forEach((finding) => {
      const row = list.createDiv({ cls: `wyqd-finding-row wyqd-finding-${finding.severity}` });
      row.createEl('strong', { text: finding.severity });
      const copy = row.createDiv();
      copy.createEl('span', { text: finding.message });
      if (finding.path) {
        copy.createEl('small', { text: finding.path });
      }
    });
  }

  private createTextField(parent: HTMLElement, label: string, value: string) {
    const field = parent.createDiv({ cls: 'wyqd-field' });
    field.createEl('label', { text: label });
    const input = field.createEl('input');
    input.type = 'text';
    input.value = value;
    return input;
  }

  private createTextArea(parent: HTMLElement, label: string, value: string) {
    const field = parent.createDiv({ cls: 'wyqd-field wyqd-field-wide' });
    field.createEl('label', { text: label });
    const input = field.createEl('textarea');
    input.value = value;
    input.rows = 3;
    return input;
  }

  private createStatusSelect(parent: HTMLElement, object: WYQDObject) {
    const field = parent.createDiv({ cls: 'wyqd-field' });
    field.createEl('label', { text: this.plugin.t('status') });
    const select = field.createEl('select');
    getObjectStatusOptions(object).forEach((status) => {
      const option = select.createEl('option', { text: status, value: status });
      option.selected = status === object.status;
    });
    return select;
  }

  private async openMarkdownFile(path?: string) {
    if (!path) {
      new Notice(this.plugin.t('filePathMissing'));
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`${this.plugin.t('markdownNotFound')} ${path}`);
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private async saveObjectFields(
    stored: Awaited<ReturnType<ObsidianVaultRepository['listObjects']>>[number],
    updates: Pick<WYQDObject, 'title' | 'status'> & Pick<Partial<WYQDObject>, 'category' | 'notes'>,
  ) {
    await this.plugin.repository.updateObject(
      stored.fileName,
      {
        ...stored.entity,
        ...updates,
        updated_at: new Date().toISOString(),
      } as WYQDObject,
      stored.body,
    );
    new Notice(`Ownly: Saved ${updates.title}.`);
    await this.render();
  }

  private async advanceObjectStatus(
    stored: Awaited<ReturnType<ObsidianVaultRepository['listObjects']>>[number],
  ) {
    const nextStatus = getNextObjectStatus(stored.entity);
    if (!nextStatus) {
      new Notice(`Ownly: ${stored.entity.title} ${this.plugin.t('alreadyTerminal')}`);
      return;
    }

    new ConfirmModal(
      this.app,
      'Advance Status',
      `Advance "${stored.entity.title}" to ${nextStatus}?`,
      async () => {
        await this.plugin.repository.updateObject(
          stored.fileName,
          {
            ...stored.entity,
            status: nextStatus,
            updated_at: new Date().toISOString(),
          } as WYQDObject,
          stored.body,
        );
        new Notice(`Ownly: Advanced ${stored.entity.title} to ${nextStatus}.`);
        await this.render();
      }
    ).open();
  }

  private async archiveObject(fileName: string) {
    if (!window.confirm(this.plugin.t('archiveConfirm'))) {
      return;
    }

    const archiveFileName = await this.plugin.repository.archiveObject(fileName);
    new Notice(`Ownly: Archived object to ${archiveFileName}.`);
    this.selectedObjectId = null;
    await this.render();
  }

  private async restoreObject(fileName: string) {
    const restoredFileName = await this.plugin.repository.restoreObject(fileName);
    new Notice(`Ownly: Restored object to ${restoredFileName}.`);
    await this.render();
  }

  private createProFeatureEntry(
    parent: HTMLElement,
    membership: ReturnType<WYQDPlugin['getMembership']>,
  ) {
    const proEntry = parent.createDiv({ cls: 'wyqd-pro-entry' });
    const copy = proEntry.createDiv();
    copy.createEl('strong', { text: this.plugin.t('proInsights') });
    copy.createEl('p', {
      text: membership.isPro
        ? 'Membership is active. Pro insights are reserved for a later alpha build.'
        : membership.upgradeMessage,
    });

    const button = proEntry.createEl('button', {
      text: membership.isPro ? this.plugin.t('previewUnavailable') : this.plugin.t('upgradeInfo'),
    });
    button.type = 'button';
    button.addEventListener('click', () => {
      new Notice(
        membership.isPro
          ? 'Ownly: Pro insights are not implemented in this build yet.'
          : `Ownly: ${membership.upgradeMessage}`,
        7000,
      );
    });
  }
}

class WYQDSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly wyqdPlugin: WYQDPlugin,
  ) {
    super(app, wyqdPlugin);
  }

  display() {
    const { containerEl } = this;
    const t = (key: WYQDTranslationKey) => this.wyqdPlugin.t(key);
    containerEl.empty();
    containerEl.addClass('wyqd-settings-view');
    const membership = this.wyqdPlugin.getMembership();

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
          this.display();
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

    const membershipPanel = shell.createDiv({ cls: 'wyqd-settings-panel' });
    const membershipHeader = membershipPanel.createDiv({ cls: 'wyqd-section-header' });
    membershipHeader.createEl('h3', { text: t('membership') });
    membershipHeader.createEl('p', { text: membership.upgradeMessage });

    let pendingLicenseKey = this.wyqdPlugin.settings.licenseKey;

    new Setting(membershipPanel)
      .setName(t('settingsLicenseKey'))
      .setDesc(t('settingsLicenseKeyDesc'))
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('OWNLY-PRO-ANNUAL-TEST')
          .setValue(this.wyqdPlugin.settings.licenseKey)
          .onChange((value) => {
            pendingLicenseKey = value;
          });
      })
      .addButton((button) =>
        button.setButtonText(t('save')).onClick(async () => {
          this.wyqdPlugin.settings.licenseKey = normalizeWYQDLicenseKey(pendingLicenseKey);
          await this.wyqdPlugin.saveSettings();
          this.wyqdPlugin.refreshWorkspaceViews();
          this.display();
        }),
      );

    new Setting(membershipPanel)
      .setName(t('plan'))
      .setDesc(`${membership.planLabel} - ${membership.statusLabel}`);

    new Setting(membershipPanel)
      .setName(t('status'))
      .setDesc(membership.upgradeMessage);

    new Setting(membershipPanel)
      .setName(t('clearLicense'))
      .setDesc(t('clearLicenseDesc'))
      .addButton((button) =>
        button
          .setButtonText(t('clear'))
          .setWarning()
          .onClick(async () => {
            this.wyqdPlugin.settings.licenseKey = '';
            await this.wyqdPlugin.saveSettings();
            this.wyqdPlugin.refreshWorkspaceViews();
            this.display();
          }),
      );
  }
}

function buildDraft(kind: DraftKind, now: Date): { id: string; title: string; content: string } {
  if (kind === 'object') {
    const entity: WYQDObject = {
      schema_version: WYQD_SCHEMA_VERSION,
      id: `obj_${toCompactTimestamp(now)}`,
      type: 'object',
      object_type: 'physical',
      title: 'Untitled Ownly Object',
      status: 'seeded',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      currency: 'CNY',
      tags: ['ownly', 'object'],
      include_in_net_worth: false,
      default_depreciates_to_zero: true,
    };
    return renderDraft(entity.id, entity.title, entity, 'Describe the object, decision context, and expected use.');
  }

  if (kind === 'snapshot') {
    const entity: AccountSnapshot = {
      schema_version: WYQD_SCHEMA_VERSION,
      id: `snap_${toCompactTimestamp(now)}`,
      type: 'snapshot',
      snapshot_type: 'net_worth',
      title: `Net Worth Snapshot ${toDate(now)}`,
      snapshot_at: toDate(now),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      currency: 'CNY',
      tags: ['ownly', 'snapshot'],
      asset_balances: [],
      liability_balances: [],
    };
    return renderDraft(entity.id, entity.title, entity, 'Record account balances and source notes.');
  }

  const entity: ReviewEntry = {
    schema_version: WYQD_SCHEMA_VERSION,
    id: `review_${toCompactTimestamp(now)}`,
    type: 'review',
    review_type: 'object_review',
    title: `Ownly Review ${toDate(now)}`,
    reviewed_at: toDate(now),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    currency: 'CNY',
    tags: ['ownly', 'review'],
  };
  return renderDraft(entity.id, entity.title, entity, 'Summarize outcome, cost, regret score, and next action.');
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

function formatObjectType(
  value: WYQDObject['object_type'],
  t: (key: WYQDTranslationKey) => string,
) {
  if (value === 'physical') return t('physical');
  if (value === 'recurring_cost') return t('fixedCost');
  return t('experience');
}

function formatBucket(
  value: ReturnType<typeof createObjectConsoleModel>['priorityItems'][number]['bucket'],
  t: (key: WYQDTranslationKey) => string,
) {
  if (value === 'pending') return t('pending');
  if (value === 'active') return t('active');
  if (value === 'review') return t('review');
  return t('closed');
}

function formatMoney(amount: number, currency = 'CNY'): string {
  return `${currency} ${amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getNextObjectStatus(object: WYQDObject): WYQDObject['status'] | null {
  if (object.object_type === 'physical') {
    const flow = getObjectStatusOptions(object);
    return nextInFlow(flow, object.status);
  }

  if (object.object_type === 'recurring_cost') {
    const flow = getObjectStatusOptions(object);
    return nextInFlow(flow, object.status);
  }

  const flow = getObjectStatusOptions(object);
  return nextInFlow(flow, object.status);
}

function getObjectStatusOptions(object: WYQDObject): WYQDObject['status'][] {
  if (object.object_type === 'physical') {
    return ['seeded', 'observing', 'purchased', 'using', 'idle', 'transferred', 'discarded'];
  }

  if (object.object_type === 'recurring_cost') {
    return ['seeded', 'active', 'paused', 'cancelled'];
  }

  return ['planned', 'in_progress', 'completed', 'reviewed'];
}

function nextInFlow<T extends string>(flow: readonly T[], current: T): T | null {
  const index = flow.indexOf(current);
  if (index < 0 || index >= flow.length - 1) return null;
  return flow[index + 1];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error.';
}

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private message: string,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message });

    const actions = contentEl.createDiv({ cls: 'wyqd-detail-actions' });
    actions.style.justifyContent = 'flex-end';
    actions.style.marginTop = '20px';

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = actions.createEl('button', { text: 'Confirm', cls: 'mod-warning' });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
