'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { getWYQDRuntimeCapabilities } from '@/core/runtime-capabilities';
import { checkWorkspaceRecovery } from '@/core/workspace-recovery';
import {
  collectTrustStatus,
  readTrustTimestamps,
  type TrustStatusAction,
  type TrustStatusProbes,
  type TrustStatusRow,
} from '@/domain/trust-status';
import { runRecoveryDrill, type RecoveryDrillReport } from '@/domain/recovery-drill';
import { DataSafetyButton } from './DataSafetyButton';

const COPY = {
  en: {
    title: 'Trust center',
    runCheck: 'Check status',
    running: 'Checking…',
    runDrill: 'Run recovery drill',
    drilling: 'Drilling…',
    drillNote: 'The drill uses disposable fixture files in memory only. It never touches your data folder.',
    drillPassed: 'Recovery drill passed — backup, validation, restore, and hash comparison all succeeded.',
    drillFailed: 'Recovery drill failed — see the failing step. Your data folder was not modified.',
    drillCleaned: 'Drill files removed, no residue.',
    reconnect: 'Reconnect',
    reauthorize: 'Re-authorize',
    chooseFolder: 'Choose folder',
    hintExport: 'Use “Data safety” above to export a backup.',
    hintValidate: 'Use “Data safety” → “Choose backup file” to validate it.',
    hintInstallPwa: 'Use the install button in the header to install the PWA.',
    rows: {
      app_mode: 'App mode',
      fsa_support: 'Local folder API',
      folder_authorization: 'Folder authorization',
      storage_persistence: 'Storage persistence',
      folder_health: 'Data folder health',
      backup_verified: 'Verified backup',
      offline_scope: 'Offline scope',
      storage_boundary: 'Storage boundary',
      cloud_folder_guidance: 'Cloud-synced folders',
      failure_actions: 'Failure → action mapping',
    } as Record<string, string>,
    stepLabels: {
      fixture: 'Fixture',
      export: 'Export backup',
      validate: 'Validate inventory + hashes',
      restore: 'Restore to isolated target',
      compare: 'Compare results',
      cleanup: 'Clean up drill data',
      error: 'Error',
    } as Record<string, string>,
  },
  zh: {
    title: '信任中心',
    runCheck: '检查状态',
    running: '检查中…',
    runDrill: '运行恢复演练',
    drilling: '演练中…',
    drillNote: '演练只在内存中使用一次性 fixture 文件，绝不触碰你的数据目录。',
    drillPassed: '恢复演练通过——备份、校验、恢复、哈希比对全部成功。',
    drillFailed: '恢复演练失败——见失败步骤。你的数据目录未被修改。',
    drillCleaned: '演练数据已清除，无残留。',
    reconnect: '重新连接',
    reauthorize: '重新授权',
    chooseFolder: '选择目录',
    hintExport: '用上方"数据安全"导出备份。',
    hintValidate: '用"数据安全" → "选择备份文件"完成校验。',
    hintInstallPwa: '用顶栏的安装按钮把 PWA 装到主屏幕。',
    rows: {
      app_mode: '应用形态',
      fsa_support: '本地目录 API',
      folder_authorization: '目录授权',
      storage_persistence: '存储持久化',
      folder_health: '数据目录健康',
      backup_verified: '已验证备份',
      offline_scope: '离线能力',
      storage_boundary: '存储边界',
      cloud_folder_guidance: '云同步目录',
      failure_actions: '失败 → 动作映射',
    } as Record<string, string>,
    stepLabels: {
      fixture: '准备 fixture',
      export: '导出备份',
      validate: '校验清单与哈希',
      restore: '恢复到隔离目标',
      compare: '比对结果',
      cleanup: '清除演练数据',
      error: '错误',
    } as Record<string, string>,
  },
} as const;

function formatDetail(row: TrustStatusRow, zh: boolean): string {
  const f = row.facts;
  switch (row.id) {
    case 'app_mode':
      return f.mode === 'pwa'
        ? zh ? '已安装为 PWA，离线外壳可用。' : 'Installed as PWA; offline shell available.'
        : f.mode === 'tab'
          ? zh ? '浏览器标签页运行；安装 PWA 可获得离线外壳。' : 'Running in a browser tab; install the PWA for the offline shell.'
          : zh ? '无法判断运行形态。' : 'Could not determine the app mode.';
    case 'fsa_support':
      return f.supported
        ? zh ? '支持，可直连本地数据目录。' : 'Supported; the local data folder can be connected.'
        : zh ? '不支持——该浏览器无法直连本地目录（iOS Safari 即此类）。' : 'Not supported — this browser cannot connect a local folder (e.g. iOS Safari).';
    case 'folder_authorization':
      return f.state === 'granted'
        ? zh ? '已授权读写。' : 'Read/write authorized.'
        : f.state === 'none'
          ? zh ? '尚未选择数据目录（演示模式数据只在内存）。' : 'No data folder chosen (demo-mode data lives in memory only).'
          : f.state === 'denied'
            ? zh ? '授权被拒绝，需重新连接。' : 'Authorization denied; reconnect required.'
            : zh ? '重启后需重新授权，这是浏览器的正常行为。' : 'Re-authorization is required after restart; this is normal browser behavior.';
    case 'storage_persistence':
      return f.persisted === true
        ? zh ? '已持久化，浏览器不会随意清理。' : 'Persisted; the browser will not evict storage casually.'
        : f.persisted === false
          ? zh ? '未持久化，浏览器可能在空间紧张时清理。' : 'Not persisted; the browser may evict storage under pressure.'
          : zh ? '该浏览器未提供持久化查询。' : 'This browser does not expose persistence status.';
    case 'folder_health':
      return f.state === 'CONNECTED'
        ? zh ? '数据目录可达。' : 'Data folder reachable.'
        : zh ? `状态：${String(f.state)}，按右侧动作恢复。` : `State: ${String(f.state)}; recover via the action.`;
    case 'backup_verified': {
      const validated = String(f.validatedAt);
      const exported = String(f.exportedAt);
      if (validated !== 'never') return zh ? `最近验证：${validated}。` : `Last verified: ${validated}.`;
      if (exported !== 'never') return zh ? `已导出（${exported}）但从未校验——备份未经验证等于没有备份。` : `Exported (${exported}) but never validated — an unverified backup is no backup.`;
      return zh ? '从未导出或验证过备份。' : 'No backup has ever been exported or validated.';
    }
    case 'offline_scope':
      return zh
        ? '离线可用：全部本地读写、诊断、备份。需联网：地图瓦片、路线规划、日历订阅。'
        : 'Works offline: all local reads/writes, doctor, backup. Needs network: map tiles, routing, calendar feeds.';
    case 'storage_boundary':
      return zh
        ? '唯一真源是你选定的本地数据目录；Ownly 不托管你的数据、不要求云账号。'
        : 'The single source of truth is your chosen local folder; Ownly hosts nothing and requires no cloud account.';
    case 'cloud_folder_guidance':
      return zh
        ? '云盘同步目录请保持本地可用，一个目录只用一个同步服务；同步冲突由服务商处理。'
        : 'For cloud-synced folders keep files available offline and use one sync provider per folder; provider conflicts stay outside Ownly.';
    case 'failure_actions':
      return f.missing
        ? zh ? `以下异常行缺少恢复动作：${String(f.missing)}。` : `Rows without a recovery action: ${String(f.missing)}.`
        : zh ? '每项异常状态都有明确的恢复动作。' : 'Every failure state maps to a recovery action.';
    default:
      return '';
  }
}

function levelDot(level: TrustStatusRow['level']): string {
  return level === 'ok'
    ? 'bg-emerald-500'
    : level === 'warn'
      ? 'bg-amber-500'
      : level === 'error'
        ? 'bg-red-500'
        : 'bg-stone-300';
}

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const { get } = await import('idb-keyval');
    return ((await get('wyqd_obsidian_handle')) as FileSystemDirectoryHandle | null) ?? null;
  } catch {
    return null;
  }
}

async function collectWebProbes(
  storageGet: (key: string) => string | null,
): Promise<TrustStatusProbes> {
  const installedMode =
    typeof window === 'undefined'
      ? 'unknown'
      : window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true
        ? 'pwa'
        : 'tab';
  const fileSystemAccess =
    typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

  const handle = await getDirectoryHandle();
  let folderAuthorization: TrustStatusProbes['folderAuthorization'] = 'none';
  if (handle) {
    try {
      if (typeof handle.queryPermission !== 'function') {
        folderAuthorization = 'unknown';
      } else {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        folderAuthorization = permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'prompt';
      }
    } catch {
      folderAuthorization = 'unknown';
    }
  }
  const recovery = await checkWorkspaceRecovery(
    handle,
    typeof navigator === 'undefined' ? true : navigator.onLine,
  ).catch(() => ({ state: 'unknown' as const }));

  let storagePersisted: boolean | null = null;
  try {
    storagePersisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    storagePersisted = null;
  }
  let storageEstimate: TrustStatusProbes['storageEstimate'] = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) storageEstimate = { quota: estimate.quota, usage: estimate.usage };
  } catch {
    storageEstimate = null;
  }

  return {
    installedMode,
    fileSystemAccess,
    folderAuthorization,
    storagePersisted,
    storageEstimate,
    workspaceRecovery: recovery.state,
    ...readTrustTimestamps({ get: storageGet, set: () => {} }),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };
}

export function TrustStatusSection({ itemVariants }: { itemVariants: Variants }) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const copy = COPY[language];
  const { runtimeTarget, isConnected, connect, storageGet } = useOwnlyWorkspace();
  const isBrowserRuntime = getWYQDRuntimeCapabilities(runtimeTarget).dataRuntime === 'browser';

  const [rows, setRows] = useState<TrustStatusRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [drill, setDrill] = useState<RecoveryDrillReport | null>(null);
  const [drilling, setDrilling] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      setRows(collectTrustStatus(await collectWebProbes(storageGet)));
    } catch {
      setRows(null);
    } finally {
      setChecking(false);
    }
  }, [storageGet]);

  // Gate 1 (#46): the operating state must be visible without asking —
  // auto-run the check on mount instead of waiting for a manual click.
  // Deferred past mount to satisfy set-state-in-effect.
  useEffect(() => {
    const timer = setTimeout(() => void runCheck(), 0);
    return () => clearTimeout(timer);
  }, [runCheck]);

  // Backup export/validation updates trust timestamps; refresh the rows when
  // the data-safety controls report a change instead of showing stale state.
  useEffect(() => {
    const refresh = () => void runCheck();
    window.addEventListener('ownly:data-changed', refresh);
    return () => window.removeEventListener('ownly:data-changed', refresh);
  }, [runCheck]);

  const runDrill = useCallback(async () => {
    setDrilling(true);
    try {
      setDrill(await runRecoveryDrill('web'));
    } catch {
      setDrill(null);
    } finally {
      setDrilling(false);
    }
  }, []);

  const reauthorize = useCallback(async () => {
    const handle = await getDirectoryHandle();
    if (handle && typeof handle.requestPermission === 'function') {
      try {
        await handle.requestPermission({ mode: 'readwrite' });
      } catch {
        // Re-collection below surfaces the resulting state either way.
      }
    }
    await runCheck();
  }, [runCheck]);

  const actionControl = (action: TrustStatusAction | null) => {
    switch (action) {
      case 'reconnect':
        return (
          <button type="button" onClick={() => void connect()} className="shrink-0 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50">
            {copy.reconnect}
          </button>
        );
      case 'reauthorize':
        return (
          <button type="button" onClick={() => void reauthorize()} className="shrink-0 rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50">
            {copy.reauthorize}
          </button>
        );
      case 'choose-folder':
        return (
          <button type="button" onClick={() => void connect()} className="shrink-0 rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-50">
            {copy.chooseFolder}
          </button>
        );
      case 'export-backup':
        return <span className="shrink-0 text-[11px] text-stone-400">{copy.hintExport}</span>;
      case 'validate-backup':
        return <span className="shrink-0 text-[11px] text-stone-400">{copy.hintValidate}</span>;
      case 'install-pwa':
        return <span className="shrink-0 text-[11px] text-stone-400">{copy.hintInstallPwa}</span>;
      default:
        return null;
    }
  };

  // Gate 1 is a Web/PWA panel: folder handles and storage probes do not
  // exist in the Obsidian runtime. Placed after all hooks.
  if (!isBrowserRuntime) return null;

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{copy.title}</h3>
        <div className="flex gap-2">
          <DataSafetyButton disabled={!isConnected} />
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checking}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {checking ? copy.running : copy.runCheck}
          </button>
          <button
            type="button"
            onClick={() => void runDrill()}
            disabled={drilling}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {drilling ? copy.drilling : copy.runDrill}
          </button>
        </div>
      </div>

      {rows ? (
        <div className={CARD_CLASS}>
          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${levelDot(row.level)}`} />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-stone-800">{copy.rows[row.id] ?? row.id}</span>
                  <span className="text-stone-500"> — {formatDetail(row, zh)}</span>
                </div>
                {actionControl(row.action)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {drill ? (
        <div className={CARD_CLASS}>
          <p className="text-xs text-stone-400">{copy.drillNote}</p>
          <div className="mt-2 space-y-1.5">
            {drill.steps.map((step) => (
              <div key={step.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 font-bold ${step.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {step.ok ? '✓' : '✗'}
                </span>
                <span className="font-medium text-stone-800">{copy.stepLabels[step.id] ?? step.id}</span>
                <span className="text-stone-500">{step.detail}</span>
              </div>
            ))}
          </div>
          <div className={`mt-3 rounded-md px-3 py-2 text-xs ${drill.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {drill.passed ? copy.drillPassed : copy.drillFailed}
            {drill.passed ? ` ${copy.drillCleaned}` : null}
          </div>
        </div>
      ) : null}
    </motion.section>
  );
}
