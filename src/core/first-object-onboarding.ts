import type { FirstObjectChoice } from './first-object-copy';

export const FIRST_OBJECT_COMPLETED_KEY = 'ownly_first_object_completed';
export const FIRST_OBJECT_DISMISSED_KEY = 'ownly_first_object_dismissed';

export interface FirstObjectPromptState {
  isConnected: boolean;
  dataLoaded: boolean;
  objectCount: number;
  completed: boolean;
  dismissed: boolean;
  promptHandled: boolean;
}

export function shouldPromptForFirstObject(state: FirstObjectPromptState): boolean {
  return state.isConnected
    && state.dataLoaded
    && state.objectCount === 0
    && !state.completed
    && !state.dismissed
    && !state.promptHandled;
}

export function firstObjectTemplateType(
  choice: FirstObjectChoice,
): 'physical' | 'recurring_cost' | 'travel' {
  return choice === 'experience' ? 'travel' : choice;
}
