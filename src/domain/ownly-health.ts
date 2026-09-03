import { checkPlannerIntegrity, type PlannerIntegrityReport } from './planner-integrity';
import type { OwnlyCaptureStateV3 } from './capture';
import type { PlannerTripPlace } from './planner';
import type { PlannerTripVisit } from './planner-visits';

export interface OwnlyHealthReport {
  checkedAt: string;
  capture: {
    collections: number;
    places: number;
    issues: Array<{ severity: 'error' | 'warning' | 'info'; category: string; message: string }>;
  };
  planner: PlannerIntegrityReport;
  summary: { errors: number; warnings: number; infos: number };
}

export function checkOwnlyHealth(input: {
  captureState?: OwnlyCaptureStateV3 | null;
  trips: Array<{ id: string }>;
  places: PlannerTripPlace[];
  visits: PlannerTripVisit[];
}): OwnlyHealthReport {
  const planner = checkPlannerIntegrity({ trips: input.trips, places: input.places, visits: input.visits });

  const captureIssues: OwnlyHealthReport['capture']['issues'] = [];
  const cs = input.captureState;
  if (cs) {
    const collIds = new Set(cs.collections.map((c) => c.id));
    // orphan capture places
    for (const p of cs.places) {
      if (!collIds.has(p.collection_id)) {
        captureIssues.push({ severity: 'error', category: 'capture_orphan_place', message: `Capture place "${p.title}" references missing collection "${p.collection_id}"` });
      }
    }
    // empty collections
    for (const c of cs.collections) {
      const count = cs.places.filter((p) => p.collection_id === c.id).length;
      if (count === 0) captureIssues.push({ severity: 'info', category: 'capture_empty_collection', message: `Collection "${c.title}" has 0 places` });
    }
    // collections without active selection but places exist (hint)
    if (cs.collections.length > 0 && !cs.active_collection_id) {
      captureIssues.push({ severity: 'info', category: 'capture_no_active', message: 'No active collection selected' });
    }
  }

  const errors = planner.summary.errors + captureIssues.filter((i) => i.severity === 'error').length;
  const warnings = planner.summary.warnings + captureIssues.filter((i) => i.severity === 'warning').length;
  const infos = planner.summary.infos + captureIssues.filter((i) => i.severity === 'info').length;

  return {
    checkedAt: new Date().toISOString(),
    capture: {
      collections: cs?.collections.length ?? 0,
      places: cs?.places.length ?? 0,
      issues: captureIssues,
    },
    planner,
    summary: { errors, warnings, infos },
  };
}
