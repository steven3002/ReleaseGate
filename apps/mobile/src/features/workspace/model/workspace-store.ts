import {
  getDocument,
  setDocument,
  listDocuments,
  deleteDocument,
} from '../../../platform/storage';
import type { Workspace } from '../types';

const COLLECTION = 'workspaces';
const SETTINGS_COLLECTION = 'workspaces';
const ACTIVE_WORKSPACE_KEY = '__active_workspace_id__';

interface ActiveWorkspaceSetting {
  id: string;
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  await setDocument(COLLECTION, workspace.id, workspace);
  await setActiveWorkspaceId(workspace.id);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return await getDocument<Workspace>(COLLECTION, id);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const all = await listDocuments<Workspace>(COLLECTION);
  return all.filter((w) => w.id && w.id !== ACTIVE_WORKSPACE_KEY);
}

export async function removeWorkspace(id: string): Promise<void> {
  await deleteDocument(COLLECTION, id);
  const activeId = await getActiveWorkspaceId();
  if (activeId === id) {
    const remaining = await listWorkspaces();
    if (remaining.length > 0 && remaining[0]) {
      await setActiveWorkspaceId(remaining[0].id);
    } else {
      await deleteDocument(SETTINGS_COLLECTION, ACTIVE_WORKSPACE_KEY);
    }
  }
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const setting = await getDocument<ActiveWorkspaceSetting>(
    SETTINGS_COLLECTION,
    ACTIVE_WORKSPACE_KEY
  );
  return setting?.id ?? null;
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  await setDocument<ActiveWorkspaceSetting>(
    SETTINGS_COLLECTION,
    ACTIVE_WORKSPACE_KEY,
    { id }
  );
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  const activeId = await getActiveWorkspaceId();
  if (activeId) {
    const ws = await getWorkspace(activeId);
    if (ws) return ws;
  }

  const all = await listWorkspaces();
  if (all.length > 0 && all[0]) {
    await setActiveWorkspaceId(all[0].id);
    return all[0];
  }
  return null;
}
