'use client';

import { useState, useEffect, useMemo } from 'react';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import type { WYQDStoredEntity } from '@/core/repository';
import type { ReviewEntry, WYQDObject } from '@/domain/types';
import { useI18n } from '@/core/i18n-context';

import { useObjectListStats } from './useObjectListStats';
import {
  useObjectFilterSort,
  matchesStatusGroup,
  matchesQuery,
  compareObjects,
  getObjectControlBucket,
  getPhysicalBucket,
  type PhysicalFilter,
  type ObjectControlBucket,
  type ObjectTypeFilter,
  type ObjectStatusGroupFilter
} from './useObjectFilterSort';
import {
  getSortLabels,
  getObjectTypeFilterLabels,
  getObjectStatusGroupLabels,
  getObjectControlLabels,
  getFilterLabels,
  isPhysicalObject,
} from './ObjectListUtils';

import { ObjectConsole } from './ObjectConsole';
import { ObjectCardPhysical } from './ObjectCardPhysical';
import { ObjectCardSupporting } from './ObjectCardSupporting';
import { ObjectPagination } from './ObjectPagination';

const PAGE_SIZE = 10;

export interface ObjectListFocus {
  token: number;
  query?: string;
  typeFilter?: ObjectTypeFilter;
  physicalFilter?: PhysicalFilter;
  statusGroupFilter?: ObjectStatusGroupFilter;
}

interface ObjectListProps {
  objects: WYQDStoredEntity<WYQDObject>[];
  reviews?: WYQDStoredEntity<ReviewEntry>[];
  focus?: ObjectListFocus | null;
  disabled?: boolean;
  onUpdate: (fileName: string, object: WYQDObject, body: string) => Promise<void>;
  onDelete: (fileName: string) => Promise<void>;
  onCreateObjectReview: (
    fileName: string,
    object: WYQDObject,
    summary: string,
    rankings: {
      foodScore: number | null;
      sceneryScore: number | null;
      experienceScore: number | null;
    },
    body: string,
  ) => Promise<void>;
}

export function ObjectList({
  objects,
  reviews = [],
  focus,
  disabled,
  onUpdate,
  onDelete,
  onCreateObjectReview,
}: ObjectListProps) {
  const { t } = useI18n();
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [exitingFileName, setExitingFileName] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [reviewingFileName, setReviewingFileName] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState('');
  const [reviewFoodScore, setReviewFoodScore] = useState('');
  const [reviewSceneryScore, setReviewSceneryScore] = useState('');
  const [reviewExperienceScore, setReviewExperienceScore] = useState('');
  const [showAllPhysical, setShowAllPhysical] = useState(false);
  const [showAllSupporting, setShowAllSupporting] = useState(false);
  const [openActionMenuFileName, setOpenActionMenuFileName] = useState<string | null>(null);
  const { confirm, prompt } = useConfirmDialog();

  const {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    statusGroupFilter,
    setStatusGroupFilter,
    filter,
    setFilter,
    controlBucketFilter,
    setControlBucketFilter,
    sortBy,
    setSortBy,
  } = useObjectFilterSort(focus);

  useEffect(() => {
    if (openActionMenuFileName === null) return;
    function handleClickOutside(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest('[role="menu"]')) {
        setOpenActionMenuFileName(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenActionMenuFileName(null);
    }
    const doc: Document = typeof window !== 'undefined' ? window.document : document;
    doc.addEventListener('mousedown', handleClickOutside);
    doc.addEventListener('keydown', handleKeyDown);
    return () => {
      doc.removeEventListener('mousedown', handleClickOutside);
      doc.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenuFileName]);

  const {
    reviewedObjectIds,
    allPhysicalObjects,
    controlCounts,
    totalCost,
    ownedPhysicalObjectsCount,
    totalResidualValue,
    averageDailyCost,
    observingObjectsCount,
    observingAmount,
    getObjectTypeFilterCount,
    getObjectStatusGroupCount,
  } = useObjectListStats(objects, reviews, query, typeFilter, statusGroupFilter);

  const visibleObjects = useMemo(() => objects.filter((stored) => {
    const object = stored.entity;
    return (
      (controlBucketFilter === null || getObjectControlBucket(object, reviewedObjectIds) === controlBucketFilter) &&
      (typeFilter === 'all' || object.object_type === typeFilter) &&
      matchesStatusGroup(object, statusGroupFilter, reviewedObjectIds) &&
      matchesQuery(object, query)
    );
  }), [objects, controlBucketFilter, typeFilter, statusGroupFilter, query, reviewedObjectIds]);

  const physicalObjects = useMemo(() => visibleObjects.filter(s => isPhysicalObject(s.entity)), [visibleObjects]);
  const supportingObjects = useMemo(
    () =>
      [...visibleObjects.filter((stored) => !isPhysicalObject(stored.entity))].sort((a, b) =>
        compareObjects(a.entity, b.entity, sortBy),
      ),
    [visibleObjects, sortBy],
  );

  const visibleSupportingObjects = showAllSupporting ? supportingObjects : supportingObjects.slice(0, PAGE_SIZE);
  const hiddenSupportingCount = supportingObjects.length - visibleSupportingObjects.length;

  const filteredObjects = useMemo(() => {
    const base = filter === 'all'
      ? physicalObjects
      : physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === filter);
    return [...base].sort((a, b) => compareObjects(a.entity, b.entity, sortBy));
  }, [physicalObjects, filter, sortBy]);

  const visibleFilteredObjects = showAllPhysical ? filteredObjects : filteredObjects.slice(0, PAGE_SIZE);
  const hiddenPhysicalCount = filteredObjects.length - visibleFilteredObjects.length;
  
  const visiblePhysicalFilterCounts: Record<PhysicalFilter, number> = {
    all: physicalObjects.length,
    active: physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === 'active').length,
    retired: physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === 'retired').length,
    sold: physicalObjects.filter((stored) => getPhysicalBucket(stored.entity.status) === 'sold').length,
  };

  const menuItemClass =
    'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40';

  function cancelObjectReview() {
    setReviewingFileName(null);
    setReviewSummary('');
    setReviewFoodScore('');
    setReviewSceneryScore('');
    setReviewExperienceScore('');
  }

  function closeInlinePanels() {
    setSelectedFileName(null);
    setEditingFileName(null);
    cancelObjectReview();
    setOpenActionMenuFileName(null);
  }

  function applyControlBucket(bucket: ObjectControlBucket | null) {
    if (bucket === null) {
      setControlBucketFilter(null);
      return;
    }
    const target = getObjectControlLabels(t)[bucket];
    closeInlinePanels();
    setQuery('');
    setFilter('all');
    setTypeFilter(target.typeFilter);
    setStatusGroupFilter(target.statusGroup);
    setControlBucketFilter(bucket);
    setShowAllPhysical(false);
    setShowAllSupporting(false);
  }

  if (objects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-center">
        <h2 className="text-base font-semibold text-stone-950">{t('noObjectsYet')}</h2>
        <p className="mt-2 text-sm text-stone-500">{t('connectVaultFirst')}</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <ObjectConsole
        objectsCount={objects.length}
        allPhysicalObjectsCount={allPhysicalObjects.length}
        totalCost={totalCost}
        ownedPhysicalObjectsCount={ownedPhysicalObjectsCount}
        totalResidualValue={totalResidualValue}
        averageDailyCost={averageDailyCost}
        observingObjectsCount={observingObjectsCount}
        observingAmount={observingAmount}
        controlCounts={controlCounts}
        controlBucketFilter={controlBucketFilter}
        applyControlBucket={applyControlBucket}
        query={query}
        setQuery={setQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        statusGroupFilter={statusGroupFilter}
        setStatusGroupFilter={setStatusGroupFilter}
        filter={filter}
        setFilter={setFilter}
        closeInlinePanels={closeInlinePanels}

        getSortLabels={getSortLabels}
        objectTypeFilterLabels={getObjectTypeFilterLabels(t)}
        getObjectTypeFilterCount={getObjectTypeFilterCount}
        objectStatusGroupLabels={getObjectStatusGroupLabels(t)}
        getObjectStatusGroupCount={getObjectStatusGroupCount}
        filterLabels={getFilterLabels(t)}
        visiblePhysicalFilterCounts={visiblePhysicalFilterCounts}
        objectControlLabels={getObjectControlLabels(t)}
        hasPhysicalObjects={physicalObjects.length > 0}
      />

      <div className="space-y-4">
        {visibleFilteredObjects.map((stored) => (
          <ObjectCardPhysical
            key={stored.fileName}
            stored={stored}
            isEditing={editingFileName === stored.fileName}
            isDetailing={selectedFileName === stored.fileName}
            disabled={disabled}
            openActionMenuFileName={openActionMenuFileName}
            exitingFileName={exitingFileName}
            deletingFileName={deletingFileName}
            onUpdate={onUpdate}
            onDelete={onDelete}
            setEditingFileName={setEditingFileName}
            setSelectedFileName={setSelectedFileName}
            setOpenActionMenuFileName={setOpenActionMenuFileName}
            setExitingFileName={setExitingFileName}
            setDeletingFileName={setDeletingFileName}
            confirm={confirm}
            menuItemClass={menuItemClass}
          />
        ))}
        <ObjectPagination 
          hiddenCount={hiddenPhysicalCount} 
          onShowAll={() => setShowAllPhysical(true)} 
          label="" 
        />
        {visibleSupportingObjects.map((stored) => (
          <ObjectCardSupporting
            key={stored.fileName}
            stored={stored}
            reviews={reviews}
            isEditing={editingFileName === stored.fileName}
            isDetailing={selectedFileName === stored.fileName}
            isReviewing={reviewingFileName === stored.fileName}
            disabled={disabled}
            openActionMenuFileName={openActionMenuFileName}
            exitingFileName={exitingFileName}
            deletingFileName={deletingFileName}
            reviewSummary={reviewSummary}
            reviewFoodScore={reviewFoodScore}
            reviewSceneryScore={reviewSceneryScore}
            reviewExperienceScore={reviewExperienceScore}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onCreateObjectReview={onCreateObjectReview}
            setEditingFileName={setEditingFileName}
            setSelectedFileName={setSelectedFileName}
            setReviewingFileName={setReviewingFileName}
            setOpenActionMenuFileName={setOpenActionMenuFileName}
            setExitingFileName={setExitingFileName}
            setDeletingFileName={setDeletingFileName}
            setReviewSummary={setReviewSummary}
            setReviewFoodScore={setReviewFoodScore}
            setReviewSceneryScore={setReviewSceneryScore}
            setReviewExperienceScore={setReviewExperienceScore}
            cancelObjectReview={cancelObjectReview}
            confirm={confirm}
            prompt={prompt}
            menuItemClass={menuItemClass}
          />
        ))}
        <ObjectPagination 
          hiddenCount={hiddenSupportingCount} 
          onShowAll={() => setShowAllSupporting(true)} 
          label="" 
        />
      </div>
    </section>
  );
}
