const STORAGE_KEY = 'ownly_workspace_id';

export function getWorkspaceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const workspaceId = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, workspaceId);

  return workspaceId;
}
