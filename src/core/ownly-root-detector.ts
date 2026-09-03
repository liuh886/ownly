/**
 * Risk 2: Obsidian/Web 双重 Ownly — OwnlyRootDetector
 * 规则：
 *  - 输入 /Ownly → OK
 *  - 输入 /Vault 且存在 Vault/Ownly → OK (使用 Vault/Ownly)
 *  - 输入空目录 → 提示 将在此创建 Ownly/
 */
export type RootDetectResult =
  | { status: 'ok'; path: string; reason: string }
  | { status: 'create'; path: string; reason: string };

export function detectOwnlyRoot(
  inputPath: string,
  exists: (p: string) => boolean,
): RootDetectResult {
  const normalized = inputPath.replace(/\/+$/, '');
  if (normalized.endsWith('/Ownly') || normalized === 'Ownly') {
    return { status: 'ok', path: normalized, reason: 'Selected Ownly folder directly' };
  }
  if (exists(`${normalized}/Ownly`)) {
    return { status: 'ok', path: `${normalized}/Ownly`, reason: 'Found Vault/Ownly' };
  }
  if (!exists(normalized) || exists(`${normalized}/.obsidian`)) {
    // Empty or Vault root without Ownly — will create
    return { status: 'create', path: `${normalized}/Ownly`, reason: 'Will create Ownly/ here' };
  }
  return { status: 'create', path: `${normalized}/Ownly`, reason: 'Will create Ownly/ here' };
}
