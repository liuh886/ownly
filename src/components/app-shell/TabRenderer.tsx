import { useRef } from 'react';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { ObjectList, type ObjectListFocus } from '@/components/objects/ObjectList';
import { ObjectComposer } from '@/components/objects/ObjectComposer';
import { ArchivePanel } from '@/components/archive/ArchivePanel';
import { AccountsOverview } from '@/components/accounts/AccountsOverview';
import { ReviewHome } from '@/components/reviews/ReviewHome';
import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { getQuickLineTemplates } from '@/components/objects/composerQuickLine';
import type { AppTab } from './BottomNav';
import type { WYQDObject, AccountSnapshot, ReviewEntry } from '@/domain/types';
import type { WYQDStoredEntity, WYQDArchivedStoredEntity } from '@/core/repository';

import type { HomeMetrics } from '@/domain/types';
import type { useOwnlyActions } from './useOwnlyActions';

interface TabRendererProps {
  activeTab: AppTab;
  isConnected: boolean;
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  storedObjects: WYQDStoredEntity<WYQDObject>[];
  storedReviews: WYQDStoredEntity<ReviewEntry>[];
  storedSnapshots: WYQDStoredEntity<AccountSnapshot>[];
  archivedEntities: WYQDArchivedStoredEntity[];
  objectListFocus: ObjectListFocus | null;
  autoFocusComposer: boolean;
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
  archivedEntities,
  objectListFocus,
  autoFocusComposer,
  actions,
  setObjectListFocus,
  setAutoFocusComposer,
  setActiveTab,
}: TabRendererProps) {
  const { t, language } = useI18n();
  const { membership } = useOwnlyWorkspace();

  const quickEntryRef = useRef<{
    templateType?: 'physical' | 'recurring_cost' | 'travel';
    focusTarget?: 'quickLine' | 'title';
  }>({});

  function openObjectsWithFocus(
    focus: Omit<ObjectListFocus, 'token'> & {
      quickEntryTemplateType?: 'physical' | 'recurring_cost' | 'travel';
      focusTarget?: 'quickLine' | 'title';
    },
  ) {
    setObjectListFocus({ ...focus, token: Date.now() });
    quickEntryRef.current = {
      templateType: focus.quickEntryTemplateType,
      focusTarget: focus.focusTarget,
    };
    setAutoFocusComposer(true);
    setActiveTab('objects');
  }

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
        <ObjectList
          key={objectListFocus?.token || 'objects-default'}
          disabled={!isConnected}
          objects={storedObjects}
          reviews={storedReviews}
          focus={objectListFocus}
          onUpdate={actions.updateObject}
          onDelete={actions.archiveObject}
          onCreateObjectReview={actions.createObjectReview}
        />
        <ObjectComposer
          disabled={!isConnected}
          submitLabel={t('saveToOwnly')}
          onSubmit={actions.createObject}
          autoFocus={autoFocusComposer}
          onAutoFocusHandled={() => setAutoFocusComposer(false)}
          focusTarget={quickEntryRef.current.focusTarget}
          initialQuickLineTemplate={
            quickEntryRef.current.templateType
              ? getQuickLineTemplates(t, language).find(
                  (tmpl) => {
                    const tType = quickEntryRef.current.templateType;
                    if (tType === 'physical') return tmpl.label === t('physicalTemplate');
                    if (tType === 'recurring_cost') return tmpl.label === t('fixedCostTemplate');
                    if (tType === 'travel') return tmpl.label === t('experienceTemplate');
                    return false;
                  },
                )?.value
              : undefined
          }
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
