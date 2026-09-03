'use client';

import { useEffect, useState, useCallback } from 'react';

interface DiagnosticReport {
  timestamp: string;
  errorName: string;
  errorMessage: string;
  errorDigest?: string;
  errorStack?: string;
  userAgent: string;
  fileSystemApiSupported: boolean;
  indexedDbSupported: boolean;
  storageKeys: { key: string; length: number; isJsonValid: boolean }[];
  corruptedKeys: string[];
  idbHandleFound: boolean;
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    const storageKeys: { key: string; length: number; isJsonValid: boolean }[] = [];
    const corruptedKeys: string[] = [];

    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        const val = window.localStorage.getItem(key) || '';
        let isJsonValid = true;
        if (val.startsWith('{') || val.startsWith('[')) {
          try {
            JSON.parse(val);
          } catch {
            isJsonValid = false;
            corruptedKeys.push(key);
          }
        }
        storageKeys.push({ key, length: val.length, isJsonValid });
      }
    }

    let idbHandleFound = false;
    let indexedDbSupported = false;
    try {
      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        indexedDbSupported = true;
        const { get } = await import('idb-keyval');
        const handle = await get('wyqd_obsidian_handle');
        idbHandleFound = Boolean(handle);
      }
    } catch {}

    const diag: DiagnosticReport = {
      timestamp: new Date().toISOString(),
      errorName: error.name || 'Error',
      errorMessage: error.message || 'Unknown error',
      errorDigest: error.digest,
      errorStack: error.stack,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      fileSystemApiSupported: typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
      indexedDbSupported,
      storageKeys,
      corruptedKeys,
      idbHandleFound,
    };

    setReport(diag);
  }, [error]);

  useEffect(() => {
    console.error('Ownly Web App Error:', error);
  }, [error]);

  const toggleDetails = () => {
    const next = !showDetails;
    setShowDetails(next);
    if (next && !report) {
      void runDiagnostics();
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleSafeCleanCorrupted = () => {
    if (!report) return;
    let count = 0;
    for (const key of report.corruptedKeys) {
      window.localStorage.removeItem(key);
      count++;
    }
    setClearedNotice(`已安全清理 ${count} 个损坏的缓存键，请点击重试。`);
    void runDiagnostics();
  };

  const handleContinueDemo = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ownly_web_onboarding_dismissed', 'true');
      window.location.reload();
    }
  };

  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center bg-stone-50 p-6 text-stone-900">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm max-w-xl w-full space-y-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-stone-900">Something went wrong</h2>
          <p className="mt-2 text-sm text-stone-600 leading-relaxed">
            加载工作区时遇到异常。可能是本地存储数据格式异常或浏览器文件系统权限未就绪。
          </p>
          {error.message && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-left font-mono text-xs text-red-800 break-words border border-red-200">
              {error.message}
            </div>
          )}
        </div>

        {clearedNotice && (
          <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
            {clearedNotice}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => reset()}
            className="flex-1 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
          >
            🔄 重新加载 (Retry)
          </button>
          <button
            onClick={handleContinueDemo}
            className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
          >
            进入演示模式 (Demo Mode)
          </button>
        </div>

        {/* Diagnostics & Self-Repair Section */}
        <div className="border-t border-stone-200 pt-4">
          <button
            type="button"
            onClick={toggleDetails}
            className="flex w-full items-center justify-between text-xs font-semibold text-stone-500 hover:text-stone-800"
          >
            <span>🛠️ 诊断与数据修复工具 (Diagnostics & Self-Repair)</span>
            <span>{showDetails ? '▲ 收起' : '▼ 展开'}</span>
          </button>

          {showDetails && report && (
            <div className="mt-4 space-y-4 text-xs text-left">
              <div className="rounded-lg bg-stone-50 p-4 border border-stone-200 space-y-2">
                <div className="font-semibold text-stone-800">环境状态检查：</div>
                <div className="grid grid-cols-2 gap-2 text-stone-600">
                  <div>文件系统 API (FSA): <span className={report.fileSystemApiSupported ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>{report.fileSystemApiSupported ? '✅ 支持' : '⚠️ 不支持 (仅内存/演示)'}</span></div>
                  <div>IndexedDB: <span className={report.indexedDbSupported ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{report.indexedDbSupported ? '✅ 正常' : '❌ 不可用'}</span></div>
                  <div>已关联数据目录: <span className="font-bold">{report.idbHandleFound ? '📁 已授权' : '⚪ 未关联'}</span></div>
                  <div>损坏的存储键: <span className={report.corruptedKeys.length > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>{report.corruptedKeys.length > 0 ? `⚠️ ${report.corruptedKeys.length} 个` : '✅ 无'}</span></div>
                </div>

                {report.corruptedKeys.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-stone-200">
                    <div className="text-red-700 font-semibold mb-1">检测到损坏键：{report.corruptedKeys.join(', ')}</div>
                    <button
                      onClick={handleSafeCleanCorrupted}
                      className="rounded bg-red-600 px-3 py-1 text-white font-semibold hover:bg-red-700"
                    >
                      一键安全清理损坏缓存
                    </button>
                  </div>
                )}
              </div>

              {report.errorStack && (
                <div>
                  <div className="font-semibold text-stone-700 mb-1">错误堆栈 (Stack Trace):</div>
                  <pre className="max-h-40 overflow-auto rounded bg-stone-900 p-3 text-[11px] text-stone-200 font-mono">
                    {report.errorStack}
                  </pre>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  {copied ? '✅ 已复制到剪贴板' : '📋 复制完整诊断报告 (Copy Report)'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
