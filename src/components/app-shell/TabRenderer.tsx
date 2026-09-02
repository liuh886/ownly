import { useCallback, useMemo, useState } from 'react';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { ObjectList, type ObjectListFocus } from '@/components/objects/ObjectList';
import { ObjectComposer } from '@/components/objects/ObjectComposer';
import { ArchivePanel } from '@/components/archive/ArchivePanel';
import { AccountsOverview } from '@/components/accounts/AccountsOverview';
import { ReviewHome } from '@/components/reviews/ReviewHome';
import { PlannerHome } from '@/components/planner/PlannerHome';
import { TripBundleManager } from '@/components/planner/TripBundleManager';
import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import type { FirstObjectChoice } from '@/core/first-object-copy';
import { firstObjectTemplateType } from '@/core/first-object-onboarding';
import { getQuickLineTemplates } from '@/components/objects/composerQuickLine';
import type { AppTab } from './BottomNav';
import type { WYQDObject, AccountSnapshot, ReviewEntry, ObjectLogEntry } from '@/domain/types';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity } from '@/core/repository';

import type { HomeMetrics } from '@/domain/types';
import type { useOwnlyActions } from './useOwnlyActions';

export interface FirstObjectRequest {
  token: number;
  choice: FirstObjectChoice;
}

interface TabRendererProps {
  activeTab: AppTab;
  isConnected: boolean;
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  storedObjects: WYQDStoredEntity<WYQDObject>[];
  storedReviews: WYQDStoredEntity<ReviewEntry>[];
  storedSnapshots: WYQDStoredEntity<AccountSnapshot>[];
  storedLogs?: WYQDStoredEntity<ObjectLogEntry>[];
  archivedEntities: WYQDArchivedStoredEntity[];
  objectListFocus: ObjectListFocus | null;
  autoFocusComposer: boolean;
  firstObjectRequest?: FirstObjectRequest;
  actions: ReturnType<typeof useOwnlyActions>;
  setObjectListFocus: (focus: ObjectListFocus | null) => void;
  setAutoFocusComposer: (focus: boolean) => void;
  setActiveTab: (tab: AppTab) => void;
}

export function TabRenderer({
  activeTab,
  isConnected,
  metrics,
  objects,
  snapshots,
  storedObjects,
  storedReviews,
  storedSnapshots,
  storedLogs,
  archivedEntities,
  objectListFocus,
  autoFocusComposer,
  firstObjectRequest,
  actions,
  setObjectListFocus,
  setAutoFocusComposer,
  setActiveTab,
}: TabRendererProps) {
  const { t, language } = useI18n();
  const { membership } = useOwnlyWorkspace();

  const [quickEntryRequest, setQuickEntryRequest] = useState<{
    token: number;
    templateValue: string;
  } | null>(null);

  const [composerFocusTarget, setComposerFocusTarget] = useState<'quickLine' | 'title' | undefined>(undefined);
  const [plannerRevision, setPlannerRevision] = useState(0);

  const quickLineTemplates = useMemo(
    () => getQuickLineTemplates(t, language),
    [language, t],
  );

  const openObjectsWithFocus = useCallback((
    focus: Omit<ObjectListFocus, 'token'> & {
      quickEntryTemplateType?: 'physical' | 'recurring_cost' | 'travel';
      focusTarget?: 'quickLine' | 'title';
    },
  ) => {
    setObjectListFocus({ ...focus, token: Date.now() });
    if (focus.quickEntryTemplateType) {
      const match = quickLineTemplates.find(
        (template) => template.kind === focus.quickEntryTemplateType,
      );
      if (match) {
        setQuickEntryRequest({ token: Date.now(), templateValue: match.value });
      }
    } else {
      setQuickEntryRequest(null);
    }
    setComposerFocusTarget(focus.focusTarget);
    setAutoFocusComposer(true);
    setActiveTab('objects');
  }, [quickLineTemplates, setActiveTab, setAutoFocusComposer, setObjectListFocus]);

  const firstObjectQuickEntryRequest = useMemo(() => {
    if (!firstObjectRequest) return undefined;
    const templateKind = firstObjectTemplateType(firstObjectRequest.choice);
    const template = quickLineTemplates.find((item) => item.kind === templateKind);
    if (!template) return undefined;
    return {
      token: firstObjectRequest.token,
      templateValue: template.value,
    };
  }, [firstObjectRequest, quickLineTemplates]);

  const effectiveQuickEntryRequest = firstObjectQuickEntryRequest ?? quickEntryRequest ?? undefined;
  const effectiveFocusTarget = firstObjectRequest ? 'title' : composerFocusTarget;

  if (activeTab === 'home') {
    return (
      <HomeDashboard
        metrics={metrics}
        objects={objects}
        snapshots={snapshots}
        onOpenObjects={openObjectsWithFocus}
      />
    );
  }

  if (activeTab === 'objects') {
    return (
      <div className="space-y-5">
        <ObjectComposer
          disabled={!isConnected}
          submitLabel={t('saveToOwnly')}
          onSubmit={actions.createObject}
          autoFocus={autoFocusComposer}
          onAutoFocusHandled={() => setAutoFocusComposer(false)}
          focusTarget={effectiveFocusTarget}
          quickEntryRequest={effectiveQuickEntryRequest}
        />
        <ObjectList
          key={objectListFocus?.token || 'objects-default'}
          disabled={!isConnected}
          objects={storedObjects}
          reviews={storedReviews}
          logs={storedLogs}
          focus={objectListFocus}
          onUpdate={actions.updateObject}
          onDelete={actions.archiveObject}
          onCreateObjectReview={actions.createObjectReview}
        />
        <ArchivePanel
          disabled={!isConnected}
          archivedEntities={archivedEntities}
          onRestore={actions.restoreArchivedEntity}
          onDelete={actions.permanentlyDeleteArchivedEntity}
          filterType="objects"
        />
      </div>
    );
  }

  if (activeTab === 'accounts') {
    return (
      <div className="space-y-5">
        <AccountsOverview
          disabled={!isConnected}
          snapshots={storedSnapshots}
          objects={objects}
          onCreateSnapshot={actions.createSnapshot}
          onUpdateSnapshot={actions.updateSnapshot}
          onDeleteSnapshot={actions.deleteSnapshot}
        />
        <ArchivePanel
          disabled={!isConnected}
          archivedEntities={archivedEntities}
          onRestore={actions.restoreArchivedEntity}
          onDelete={actions.permanentlyDeleteArchivedEntity}
          filterType="accounts"
        />
      </div>
    );
  }

  if (activeTab === 'planner') {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <TripBundleManager
            disabled={!isConnected}
            onImported={() => setPlannerRevision((revision) => revision + 1)}
          />
        </div>
        <PlannerHome key={plannerRevision} disabled={!isConnected} />
      </div>
    );
  }

  if (activeTab === 'reviews') {
    return (
      <div className="space-y-5">
        <ReviewHome
          disabled={!isConnected}
          objects={objects}
          reviews={storedReviews}
          membership={membership}
          onCreateReview={actions.createReview}
          onUpdateReview={actions.updateReview}
          onDeleteReview={actions.deleteReview}
        />
        <ArchivePanel
          disabled={!isConnected}
          archivedEntities={archivedEntities}
          onRestore={actions.restoreArchivedEntity}
          onDelete={actions.permanentlyDeleteArchivedEntity}
          filterType="reviews"
        />
      </div>
    );
  }

  return null;
}