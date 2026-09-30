import { describe, expect, it } from 'vitest';
import { getFirstRunCopy } from './first-run-copy';
import { hasSeenCaptureExplainer, resolveFirstRunStep, type FirstRunState } from './first-run';
import { getFirstObjectCopy } from './first-object-copy';

const NEW_USER: FirstRunState = {
  isConnected: true,
  dataLoaded: true,
  objectCount: 0,
  completed: false,
  dismissed: false,
  captureExplainerSeen: false,
  sampleTripLoaded: false,
};

describe('first-run orchestration', () => {
  it('teaches the model first, on a connected and loaded empty folder', () => {
    expect(resolveFirstRunStep(NEW_USER)).toBe('model');
  });

  it('goes straight to the record step when the explainer was already seen', () => {
    // A returning user who dismissed the retired standalone dialog must not be
    // shown the same lesson again — that was the double-interrupt bug.
    expect(resolveFirstRunStep({ ...NEW_USER, captureExplainerSeen: true })).toBe('first-record');
  });

  it('interrupts only once per session, never with two competing dialogs', () => {
    // The old path could satisfy neither flag and re-open; a single step value
    // makes "one dialog, one decision" structurally impossible.
    const step = resolveFirstRunStep(NEW_USER);
    expect(step).not.toBeNull();
    expect(resolveFirstRunStep({ ...NEW_USER, dismissed: true })).toBeNull();
    expect(resolveFirstRunStep({ ...NEW_USER, completed: true })).toBeNull();
  });

  it('stays silent until the data folder is connected and loaded', () => {
    expect(resolveFirstRunStep({ ...NEW_USER, isConnected: false })).toBeNull();
    expect(resolveFirstRunStep({ ...NEW_USER, dataLoaded: false })).toBeNull();
  });

  it('stays silent once the folder holds anything at all', () => {
    expect(resolveFirstRunStep({ ...NEW_USER, objectCount: 1 })).toBeNull();
  });

  it('treats a loaded Sample Trip as satisfying setup', () => {
    // A Sample Trip is a real trip in the user's own folder, so re-prompting
    // for a "first real record" right after would be nagging.
    expect(resolveFirstRunStep({ ...NEW_USER, sampleTripLoaded: true })).toBeNull();
  });

  it('reads the legacy explainer key in both historical encodings', () => {
    expect(hasSeenCaptureExplainer('1')).toBe(true);
    expect(hasSeenCaptureExplainer('true')).toBe(true);
    expect(hasSeenCaptureExplainer('0')).toBe(false);
    expect(hasSeenCaptureExplainer(null)).toBe(false);
  });
});

describe('first-run copy', () => {
  it('leads with a one-sentence model in both languages', () => {
    expect(getFirstRunCopy('en').modelTitle).toBe('Collect → Curate → Plan');
    expect(getFirstRunCopy('zh').modelTitle).toBe('收集 → 整理 → 规划');
  });

  it('carries exactly three model steps and three record choices', () => {
    for (const language of ['en', 'zh'] as const) {
      const copy = getFirstRunCopy(language);
      expect(copy.model).toHaveLength(3);
      expect(Object.keys(copy.choices)).toEqual(['physical', 'recurring_cost', 'experience']);
      expect(copy.choices.physical.example).toBeTruthy();
    }
  });

  it('keeps the governance promise that nothing is demo data', () => {
    expect(getFirstRunCopy('en').recordDescription).toContain('not demo data');
    expect(getFirstRunCopy('zh').recordDescription).toContain('而不是演示数据');
    // The retired dialog's own wording is asserted in first-object-onboarding.test.ts.
    expect(getFirstObjectCopy('en').description).toContain('not demo data');
  });

  it('presents the Sample Trips as ordinary, deletable trips', () => {
    expect(getFirstRunCopy('en').sampleBody).toContain('delete it whenever you like');
    expect(getFirstRunCopy('zh').sampleBody).toContain('任何时候都能删掉');
  });
});
