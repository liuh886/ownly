import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ObjectListFocus } from '@/components/objects/ObjectList';
import { extractTripSharePayload } from '@/domain/trip-share-link';
import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { focusPlannerTrip } from '@/core/planner-focus';
import type { FirstObjectChoice } from '@/core/first-object-copy';
import { firstObjectTemplateType } from '@/core/first-object-onboarding';
import { getQuickLineTemplates } from '@/components/objects/composerQuickLine';
import type { AppTab } from './BottomNav';
import type { WYQDObject, AccountSnapshot, ReviewEntry, ObjectLogEntry } from '@/domain/types';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity } from '@/core/repository';

import type { HomeMetrics } from '@/domain/types';
import type { useOwnlyActions } from './useOwnlyActions';

/** Deferred tabs keep the initial /app bundle to the active screen only. */
const tabLoading = () => (
  <div className="py-10" role="status">
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="ownly-skeleton h-24 rounded-xl" aria-hidden="true" />
      <div className="ownly-skeleton h-24 rounded-xl" aria-hidden="true" />
      <div className="ownly-skeleton hidden h-24 rounded-xl sm:block" aria-hidden="true" />
    </div>
  </div>
);

const HomeDashboard = dynamic(
  () => import('@/components/home/HomeDashboard').then((mod) => mod.HomeDashboard),
  { loading: tabLoading },
);
const ObjectInsightsPanel = dynamic(
  () => import('@/components/objects/ObjectInsightsPanel').then((mod) => mod.ObjectInsightsPanel),
  { loading: tabLoading },
);
const ObjectComposer = dynamic(
  () => import('@/components/objects/ObjectComposer').then((mod) => mod.ObjectComposer),
  { loading: tabLoading },
);
const ObjectList = dynamic(
  () => import('@/components/objects/ObjectList').then((mod) => mod.ObjectList),
  { loading: tabLoading },
);
const ArchivePanel = dynamic(
  () => import('@/components/archive/ArchivePanel').then((mod) => mod.ArchivePanel),
  { loading: tabLoading },
);
const AccountsOverview = dynamic(
  () => import('@/components/accounts/AccountsOverview').then((mod) => mod.AccountsOverview),
  { loading: tabLoading },
);
const ReviewHome = dynamic(
  () => import('@/components/reviews/ReviewHome').then((mod) => mod.ReviewHome),
  { loading: tabLoading },
);
const PlannerHome = dynamic(
  () => import('@/components/planner/PlannerHome').then((mod) => mod.PlannerHome),
  { loading: tabLoading },
);

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

  useEffect(() => {
    const routeSharedTrip = () => {
      if (extractTripSharePayload(window.location.hash)) setActiveTab('planner');
    };
    routeSharedTrip();
    window.addEventListener('hashchange', routeSharedTrip);
    return () => window.removeEventListener('hashchange', routeSharedTrip);
  }, [setActiveTab]);

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

  const openPlannerTrip = useCallback((tripId: string) => {
    focusPlannerTrip(tripId);
    setActiveTab('planner');
  }, [setActiveTab]);

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
        onOpenTrip={openPlannerTrip}
        onOpenAccounts={() => setActiveTab('accounts')}
      />
    );
  }

  if (activeTab === 'objects') {
    return (
      <div className="space-y-5">
        <ObjectInsightsPanel
          objects={objects}
          snapshots={snapshots}
          logs={storedLogs?.map((stored) => stored.entity) ?? []}
          membership={membership}
          language={language}
        />
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
        <PlannerHome disabled={!isConnected} />
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
