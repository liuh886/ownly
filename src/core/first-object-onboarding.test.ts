import { describe, expect, it } from 'vitest';
import { getFirstObjectCopy } from './first-object-copy';
import {
  firstObjectTemplateType,
  shouldPromptForFirstObject,
} from './first-object-onboarding';

const readyState = {
  isConnected: true,
  dataLoaded: true,
  objectCount: 0,
  completed: false,
  dismissed: false,
  promptHandled: false,
};

describe('first real object onboarding policy', () => {
  it('opens only for a connected, loaded, genuinely empty dataset', () => {
    expect(shouldPromptForFirstObject(readyState)).toBe(true);
    expect(shouldPromptForFirstObject({ ...readyState, isConnected: false })).toBe(false);
    expect(shouldPromptForFirstObject({ ...readyState, dataLoaded: false })).toBe(false);
    expect(shouldPromptForFirstObject({ ...readyState, objectCount: 1 })).toBe(false);
  });

  it('does not repeatedly interrupt completed, dismissed, or already handled users', () => {
    expect(shouldPromptForFirstObject({ ...readyState, completed: true })).toBe(false);
    expect(shouldPromptForFirstObject({ ...readyState, dismissed: true })).toBe(false);
    expect(shouldPromptForFirstObject({ ...readyState, promptHandled: true })).toBe(false);
  });

  it('maps each choice into an existing canonical composer template', () => {
    expect(firstObjectTemplateType('physical')).toBe('physical');
    expect(firstObjectTemplateType('recurring_cost')).toBe('recurring_cost');
    expect(firstObjectTemplateType('experience')).toBe('travel');
  });

  it('explains in both languages that real records replace automatic demo seeding', () => {
    const en = getFirstObjectCopy('en');
    const zh = getFirstObjectCopy('zh');

    expect(en.description).toContain('not demo data');
    expect(en.emptyDescription).toContain('No demo records');
    expect(zh.description).toContain('不是演示数据');
    expect(zh.emptyDescription).toContain('不会自动写入演示数据');
  });
});
