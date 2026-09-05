'use client';

import { useMemo, useState } from 'react';
import type {
  PlannerScheduledPlace,
  PlannerTrip,
  PlannerTripPlace,
  TripExpenseCategory,
  TripExpenseItem,
} from '@/domain/planner';
import {
  effectiveFxRate,
  estimateTripBudget,
  type FxSettings,
} from '@/domain/planner';
import {
  calculateTripSettlementWithPayments,
  resolveExpensePayments,
  type TripExpenseWithPayments,
} from '@/domain/expense-payments';

interface PlannerBudgetLedgerProps {
  trip: PlannerTrip;
  scheduledPlaces: PlannerScheduledPlace[];
  allPlaces?: PlannerTripPlace[];
  activeDate?: string;
  initialPlaceId?: string | null;
  onClearInitialPlaceId?: () => void;
  expenses: TripExpenseItem[];
  onAddExpense: (expense: Omit<TripExpenseItem, 'id' | 'created_at'>) => void;
  onDeleteExpense: (expenseId: string) => void;
  members: string[];
  onUpdateMembers: (members: string[]) => void;
  onUpdateFxRates?: (rates: Record<string, number>) => void;
  language?: 'zh' | 'en';
}

const CATEGORY_MAP: Record<TripExpenseCategory, { icon: string; zh: string; en: string }> = {
  stay: { icon: '🏨', zh: '住宿', en: 'Stay' },
  food: { icon: '🍜', zh: '餐饮', en: 'Food' },
  transit: { icon: '🚗', zh: '交通', en: 'Transit' },
  ticket: { icon: '🎟️', zh: '门票', en: 'Ticket' },
  shopping: { icon: '🛍️', zh: '购物', en: 'Shopping' },
  other: { icon: '💡', zh: '其他', en: 'Other' },
};

const COMMON_CURRENCIES = ['CNY', 'THB', 'JPY', 'USD', 'EUR', 'GBP', 'SGD', 'HKD', 'TWD'];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function PlannerBudgetLedger({
  trip,
  scheduledPlaces,
  allPlaces,
  activeDate,
  initialPlaceId,
  onClearInitialPlaceId,
  expenses,
  onAddExpense,
  onDeleteExpense,
  members,
  onUpdateMembers,
  onUpdateFxRates,
  language = 'zh',
}: PlannerBudgetLedgerProps) {
  const zh = language === 'zh';
  const baseCurrency = (trip.currency || 'CNY').trim().toUpperCase();
  const availableCurrencies = useMemo(() => {
    return Array.from(new Set([baseCurrency, ...COMMON_CURRENCIES]));
  }, [baseCurrency]);

  const selectablePlaces = useMemo(() => {
    if (allPlaces && allPlaces.length > 0) {
      return allPlaces.filter((p) => p.state !== 'dropped');
    }
    return scheduledPlaces;
  }, [allPlaces, scheduledPlaces]);

  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>(initialPlaceId ?? '');
  const [expenseDate, setExpenseDate] = useState<string>(activeDate ?? '');
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currencyOverride, setCurrencyOverride] = useState<string | null>(null);
  const currency = currencyOverride ?? baseCurrency;
  const [category, setCategory] = useState<TripExpenseCategory>('food');
  const [paidByOverride, setPaidByOverride] = useState<string | null>(null);
  const [splitOverride, setSplitOverride] = useState<string[] | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<Record<string, string> | null>(null);
  const paidBy = paidByOverride && members.includes(paidByOverride)
    ? paidByOverride
    : members[0] || (zh ? '我' : 'Me');
  const selectedSplits = splitOverride && splitOverride.length > 0 && splitOverride.every((m) => members.includes(m))
    ? splitOverride
    : [...members];
  const setSelectedSplits = (
    next: string[] | ((prev: string[]) => string[]),
  ): void => setSplitOverride(typeof next === 'function' ? next(selectedSplits) : next);
  const [notes, setNotes] = useState('');
  const [showFxEditor, setShowFxEditor] = useState(false);
  const [fxDraft, setFxDraft] = useState<Record<string, string>>({});
  const [memberNotice, setMemberNotice] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  const [prevInitialPlaceId, setPrevInitialPlaceId] = useState<string | null>(initialPlaceId ?? null);
  if (initialPlaceId && initialPlaceId !== prevInitialPlaceId) {
    setPrevInitialPlaceId(initialPlaceId);
    setSelectedPlaceId(initialPlaceId);
    setIsAddingExpense(true);
    if (activeDate) {
      setExpenseDate(activeDate);
    }
    const found = selectablePlaces.find((p) => p.id === initialPlaceId);
    if (found) {
      setTitle(found.title);
      const kind = found.kind?.toLowerCase();
      if (kind === 'stay' || kind === 'hotel') setCategory('stay');
      else if (kind === 'restaurant' || kind === 'food' || kind === 'cafe' || kind === 'dining') setCategory('food');
      else if (kind === 'transit' || kind === 'station' || kind === 'transport') setCategory('transit');
      else if (kind === 'attraction' || kind === 'sightseeing' || kind === 'activity') setCategory('ticket');
      else if (kind === 'shopping' || kind === 'mall') setCategory('shopping');
    }
  } else if (!initialPlaceId && prevInitialPlaceId !== null) {
    setPrevInitialPlaceId(null);
  }

  const handlePlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId);
    if (placeId) {
      const found = selectablePlaces.find((p) => p.id === placeId);
      if (found) {
        if (!title.trim()) {
          setTitle(found.title);
        }
        const kind = found.kind?.toLowerCase();
        if (kind === 'stay' || kind === 'hotel') setCategory('stay');
        else if (kind === 'restaurant' || kind === 'food' || kind === 'cafe' || kind === 'dining') setCategory('food');
        else if (kind === 'transit' || kind === 'station' || kind === 'transport') setCategory('transit');
        else if (kind === 'attraction' || kind === 'sightseeing' || kind === 'activity') setCategory('ticket');
        else if (kind === 'shopping' || kind === 'mall') setCategory('shopping');
      }
    }
  };

  const startAddExpense = () => {
    setIsAddingExpense(true);
    if (!expenseDate && activeDate) {
      setExpenseDate(activeDate);
    }
  };

  const handleCancelAddExpense = () => {
    setIsAddingExpense(false);
    setSelectedPlaceId('');
    setExpenseDate(activeDate ?? '');
    setTitle('');
    setAmountStr('');
    setNotes('');
    setPaidByOverride(null);
    setSplitOverride(null);
    setPaymentDraft(null);
    onClearInitialPlaceId?.();
  };

  const fx = useMemo<FxSettings>(
    () => ({ base: (trip.currency || 'CNY').trim().toUpperCase(), overrides: trip.fx_rates }),
    [trip.currency, trip.fx_rates],
  );

  const budgetEstimation = useMemo(() => {
    return estimateTripBudget(scheduledPlaces, members.length || 1, fx);
  }, [scheduledPlaces, members.length, fx]);

  const fxRowCodes = useMemo(() => {
    const codes = new Set<string>();
    budgetEstimation.currencies.forEach((c) => { if (c !== baseCurrency) codes.add(c); });
    Object.keys(trip.fx_rates ?? {}).forEach((c) => { if (c !== baseCurrency) codes.add(c); });
    return [...codes].sort();
  }, [budgetEstimation.currencies, trip.fx_rates, baseCurrency]);

  const expensesWithPayments = expenses as TripExpenseWithPayments[];
  const settlement = useMemo(() => {
    return calculateTripSettlementWithPayments(expensesWithPayments, members, fx);
  }, [expensesWithPayments, members, fx]);

  const recordedTotal = useMemo(() => {
    const total = expenses.reduce((sum, expense) => {
      const rate = effectiveFxRate(expense.currency, fx);
      return sum + (rate === null ? expense.amount : expense.amount * rate);
    }, 0);
    return roundMoney(total);
  }, [expenses, fx]);

  const parsedExpenseAmount = useMemo(() => {
    const parsed = parseFloat(amountStr.replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [amountStr]);

  const explicitPayments = useMemo(() => {
    if (paymentDraft === null) {
      return parsedExpenseAmount > 0 ? [{ member: paidBy, amount: parsedExpenseAmount }] : [];
    }
    return members
      .map((member) => ({ member, amount: parseFloat((paymentDraft[member] ?? '').replace(/,/g, '')) }))
      .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0)
      .map((payment) => ({ ...payment, amount: roundMoney(payment.amount) }));
  }, [members, paidBy, parsedExpenseAmount, paymentDraft]);

  const paymentTotal = useMemo(
    () => roundMoney(explicitPayments.reduce((sum, payment) => sum + payment.amount, 0)),
    [explicitPayments],
  );
  const paymentDifference = roundMoney(parsedExpenseAmount - paymentTotal);
  const paymentDraftValid = paymentDraft === null || (parsedExpenseAmount > 0 && Math.abs(paymentDifference) <= 0.01);

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    if (members.includes(trimmed)) {
      setMemberNotice(zh ? `'${trimmed}' 已存在` : `'${trimmed}' already exists`);
      setTimeout(() => setMemberNotice(''), 2500);
      return;
    }
    const next = [...members, trimmed];
    onUpdateMembers(next);
    setSelectedSplits(next);
    if (paymentDraft) setPaymentDraft({ ...paymentDraft, [trimmed]: '' });
    setNewMemberName('');
    setMemberNotice('');
    setIsAddingMember(false);
  };

  const handleRemoveMember = (name: string) => {
    if (members.length <= 1) return;
    const next = members.filter((m) => m !== name);
    onUpdateMembers(next);
    setSelectedSplits((prev) => prev.filter((m) => m !== name));
    if (paymentDraft) {
      const nextPayments = { ...paymentDraft };
      delete nextPayments[name];
      setPaymentDraft(nextPayments);
    }
  };

  const startMultiPayment = () => {
    const next: Record<string, string> = {};
    members.forEach((member) => { next[member] = ''; });
    if (paidBy) next[paidBy] = parsedExpenseAmount > 0 ? String(parsedExpenseAmount) : '';
    setPaymentDraft(next);
  };

  const fillEqualPayments = () => {
    if (parsedExpenseAmount <= 0 || selectedSplits.length === 0) return;
    const next: Record<string, string> = {};
    members.forEach((member) => { next[member] = ''; });
    const baseShare = Math.floor((parsedExpenseAmount / selectedSplits.length) * 100) / 100;
    let assigned = 0;
    selectedSplits.forEach((member, index) => {
      const amount = index === selectedSplits.length - 1
        ? roundMoney(parsedExpenseAmount - assigned)
        : baseShare;
      assigned = roundMoney(assigned + amount);
      next[member] = String(amount);
    });
    setPaymentDraft(next);
  };

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || parsedExpenseAmount <= 0 || !paymentDraftValid) return;

    const item: Omit<TripExpenseWithPayments, 'id' | 'created_at'> = {
      trip_id: trip.id,
      place_id: selectedPlaceId ? selectedPlaceId : undefined,
      title: title.trim(),
      category,
      amount: parsedExpenseAmount,
      currency,
      date: expenseDate.trim() || activeDate || undefined,
      paid_by: paidBy || members[0] || (zh ? '我' : 'Me'),
      split_members: selectedSplits.length > 0 ? selectedSplits : members,
      notes: notes.trim() || undefined,
      payments: explicitPayments,
    };
    onAddExpense(item);

    setTitle('');
    setAmountStr('');
    setNotes('');
    setSelectedPlaceId('');
    setExpenseDate(activeDate ?? '');
    setPaidByOverride(null);
    setSplitOverride(null);
    setPaymentDraft(null);
    setIsAddingExpense(false);
    onClearInitialPlaceId?.();
  };

  const copySettlementText = async () => {
    let copied = false;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(settlement.summaryText);
        copied = true;
      } catch {}
    }
    if (!copied && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = settlement.summaryText;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {}
    }
    setCopyNotice(
      copied
        ? (zh ? '✓ 已复制 AA 结账清单，可直接发微信群！' : '✓ Copied settlement text to clipboard!')
        : (zh ? '⚠️ 复制失败，请手动长按复制' : '⚠️ Copy failed, please copy manually'),
    );
    setTimeout(() => setCopyNotice(''), 3500);
  };

  const toggleSplitMember = (m: string) => {
    if (selectedSplits.includes(m)) {
      if (selectedSplits.length > 1) {
        setSelectedSplits(selectedSplits.filter((item) => item !== m));
      }
    } else {
      setSelectedSplits([...selectedSplits, m]);
    }
  };

  const renderExpenseItem = (item: TripExpenseWithPayments) => {
    const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
    const payments = resolveExpensePayments(item);
    const boundPlace = item.place_id ? selectablePlaces.find((p) => p.id === item.place_id) : undefined;
    return (
      <div
        key={item.id}
        className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/70 p-2 text-xs transition hover:bg-stone-100/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm">{cat.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="truncate font-semibold text-stone-900">{item.title}</span>
              {boundPlace ? (
                <span
                  className="shrink-0 rounded bg-emerald-50 px-1 py-0.2 text-[9.5px] font-medium text-emerald-700 border border-emerald-200"
                  title={boundPlace.title}
                >
                  📍 {boundPlace.title}
                </span>
              ) : item.place_id ? (
                <span className="shrink-0 rounded bg-stone-100 px-1 py-0.2 text-[9.5px] text-stone-500">
                  📍 {zh ? '已关联地点' : 'Linked Place'}
                </span>
              ) : null}
              {item.date ? (
                <span className="shrink-0 rounded bg-stone-100 px-1 py-0.2 text-[9.5px] text-stone-500 font-mono">
                  {item.date}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-stone-500">
              <span>{item.split_members.length}{zh ? '人分摊' : ' split'}</span>
              <span>·</span>
              <span>{zh ? '已支付' : 'Paid'}:</span>
              {payments.map((payment) => (
                <span key={payment.member} className="font-medium text-stone-700">
                  {payment.member} {item.currency} {payment.amount.toLocaleString()}
                </span>
              ))}
              {item.notes ? (
                <>
                  <span>·</span>
                  <span className="italic text-stone-400">💬 {item.notes}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <strong className="font-bold text-stone-900">
            {item.currency} {item.amount.toLocaleString()}
          </strong>
          <button
            type="button"
            onClick={() => onDeleteExpense(item.id)}
            className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-rose-600"
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3 text-stone-900">
      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
            <span>👥</span>
            <span>{zh ? '同行成员 (' : 'Companions ('}{members.length} {zh ? '人)' : 'members)'}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingMember(!isAddingMember)}
            className="text-[11px] font-semibold text-emerald-700 hover:underline"
          >
            {isAddingMember ? (zh ? '取消' : 'Cancel') : (zh ? '+ 添加成员' : '+ Add')}
          </button>
        </div>

        {isAddingMember ? (
          <form onSubmit={handleAddMember} className="mt-2 flex flex-col gap-1">
            {memberNotice ? <p className="text-[10px] text-amber-600">{memberNotice}</p> : null}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder={zh ? '输入同伴昵称...' : 'Member name...'}
                className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-xs outline-hidden focus:border-emerald-500"
                autoFocus
              />
              <button
                type="submit"
                className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-semibold text-white hover:bg-stone-800"
              >
                {zh ? '确定' : 'Add'}
              </button>
            </div>
          </form>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700"
            >
              {m}
              {members.length > 1 ? (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(m)}
                  className="text-[10px] text-stone-400 hover:text-rose-600"
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-2xs">
          <span className="text-[11px] font-medium text-emerald-800">
            {zh ? '💰 全程预估预算' : 'Estimated Budget'}
          </span>
          <div className="mt-1 text-base font-extrabold text-emerald-950">
            {baseCurrency} {budgetEstimation.totalEstimated.toLocaleString()}
          </div>
          <p className="mt-0.5 text-[10px] text-emerald-700">
            {zh
              ? `基于已排日程 (人均 ${baseCurrency} ${budgetEstimation.perPersonEstimated.toLocaleString()})`
              : `Per person ${baseCurrency} ${budgetEstimation.perPersonEstimated.toLocaleString()}`}
          </p>
          {budgetEstimation.currencies.length > 1 ? (
            (() => {
              const missing = budgetEstimation.currencies.filter((c) => c !== baseCurrency && effectiveFxRate(c, fx) === null);
              const converted = budgetEstimation.currencies.filter((c) => c !== baseCurrency && effectiveFxRate(c, fx) !== null);
              if (missing.length > 0) {
                return (
                  <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                    ⚠️ {zh
                      ? `缺少 ${missing.join(' / ')} 汇率，相关金额按面值计入（请在下方汇率设置中补充）`
                      : `Missing FX rate for ${missing.join(' / ')} — amounts counted at face value (set rates below)`}
                  </p>
                );
              }
              if (converted.length > 0) {
                return (
                  <p className="mt-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-200">
                    💱 {zh
                      ? `已按行程币种 ${baseCurrency} 折算：${converted.join(' / ')}`
                      : `Converted to ${baseCurrency}: ${converted.join(' / ')}`}
                  </p>
                );
              }
              return null;
            })()
          ) : null}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
          <span className="text-[11px] font-medium text-stone-500">
            {zh ? '💸 已记录支出' : 'Total Spent'}
          </span>
          <div className="mt-1 text-base font-extrabold text-stone-900">
            {baseCurrency} {recordedTotal.toLocaleString()}
          </div>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {zh
              ? `人均已支出 ${baseCurrency} ${members.length > 0 ? Math.round(recordedTotal / members.length).toLocaleString() : 0}`
              : `Per person ${baseCurrency} ${members.length > 0 ? Math.round(recordedTotal / members.length).toLocaleString() : 0}`}
          </p>
        </div>
      </div>

      {fxRowCodes.length > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-900">
              💱 {zh ? `汇率设置（1 外币 = ? ${baseCurrency}）` : `FX rates (1 unit = ? ${baseCurrency})`}
            </span>
            <button
              type="button"
              onClick={() => {
                setShowFxEditor((v) => !v);
                setFxDraft({});
              }}
              className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100"
            >
              {showFxEditor ? (zh ? '收起' : 'Close') : (zh ? '调整' : 'Adjust')}
            </button>
          </div>

          {!showFxEditor ? (
            <p className="mt-1 text-[10px] text-sky-800/80">
              {fxRowCodes.map((code) => `${code}: ×${effectiveFxRate(code, fx) ?? '?'}`).join(' · ')}{' '}
              {zh ? '(内置近似汇率，可调整)' : '(built-in reference rates, editable)'}
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {fxRowCodes.map((code) => (
                <div key={code} className="flex items-center gap-2 text-[11px]">
                  <span className="w-12 font-bold text-sky-900">{code}</span>
                  <span className="text-stone-400">=</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={fxDraft[code] ?? String(effectiveFxRate(code, fx) ?? '')}
                    onChange={(e) => setFxDraft((prev) => ({ ...prev, [code]: e.target.value }))}
                    className="w-24 rounded border border-stone-300 px-1.5 py-0.5 text-right font-mono text-[11px]"
                  />
                  <span className="text-stone-500">{baseCurrency}</span>
                </div>
              ))}
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setFxDraft({}); setShowFxEditor(false); }}
                  className="rounded-md border border-stone-200 px-2 py-1 text-[10px] font-semibold text-stone-600 hover:bg-white"
                >
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, number> = { ...(trip.fx_rates ?? {}) };
                    for (const [code, raw] of Object.entries(fxDraft)) {
                      const num = parseFloat(raw);
                      if (Number.isFinite(num) && num > 0) next[code] = num;
                    }
                    onUpdateFxRates?.(next);
                    setShowFxEditor(false);
                    setFxDraft({});
                  }}
                  className="rounded-md bg-sky-700 px-3 py-1 text-[10px] font-bold text-white hover:bg-sky-800"
                >
                  ✓ {zh ? '保存汇率' : 'Save rates'}
                </button>
              </div>
              <p className="text-[9.5px] leading-4 text-stone-400">
                {zh
                  ? '默认为内置近似参考值，仅供本地折算展示；修改后仅保存在行程文件中，不影响原始价格记录。'
                  : 'Defaults are built-in reference values for local display only; overrides persist on the trip file and never alter captured prices.'}
              </p>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-stone-800">
            {zh ? '📝 记账与付款流水' : 'Expense Ledger'}
          </span>
          <button
            type="button"
            onClick={() => {
              if (isAddingExpense) {
                handleCancelAddExpense();
              } else {
                startAddExpense();
              }
            }}
            className="rounded-lg bg-stone-950 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-stone-800"
          >
            {isAddingExpense ? (zh ? '✕ 收起' : '✕ Close') : (zh ? '+ 记一笔' : '+ Add Expense')}
          </button>
        </div>

        {isAddingExpense ? (
          <form onSubmit={handleSubmitExpense} className="mt-3 space-y-3 border-t border-stone-100 pt-3">
            <div>
              <label className="block text-[11px] font-semibold text-stone-500">
                {zh ? '消费类别' : 'Category'}
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(Object.keys(CATEGORY_MAP) as TripExpenseCategory[]).map((cat) => {
                  const meta = CATEGORY_MAP[cat];
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        isSelected ? 'bg-stone-900 text-white shadow-2xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {meta.icon} {zh ? meta.zh : meta.en}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '消费项目' : 'Item Title'}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={zh ? '如: 豪华海鲜晚餐' : 'e.g. Seafood dinner'}
                  className="mt-1 w-full rounded-lg border border-stone-300 p-1.5 text-xs outline-hidden focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '金额' : 'Amount'}
                </label>
                <div className="mt-1 flex gap-1">
                  <select
                    value={currency}
                    onChange={(e) => setCurrencyOverride(e.target.value)}
                    className="w-16 rounded-lg border border-stone-300 bg-stone-50 px-1 text-xs"
                  >
                    {availableCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full flex-1 rounded-lg border border-stone-300 p-1.5 text-xs font-bold outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '关联地点 (可选)' : 'Linked Place (Optional)'}
                </label>
                <select
                  value={selectedPlaceId}
                  onChange={(e) => handlePlaceSelect(e.target.value)}
                  className="mt-1 w-full truncate rounded-lg border border-stone-300 bg-white p-1.5 text-xs font-medium outline-hidden focus:border-emerald-500"
                >
                  <option value="">{zh ? '（无关联地点）' : '(No linked place)'}</option>
                  {selectablePlaces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.area ? `(${p.area})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '消费日期 (可选)' : 'Date (Optional)'}
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-1.5 text-xs font-medium outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '主要垫付人' : 'Primary Payer'}
                </label>
                <select
                  value={paidBy}
                  onChange={(e) => setPaidByOverride(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 p-1.5 text-xs font-medium"
                >
                  {members.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '谁分摊 (默认全员)' : 'Split Between'}
                </label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {members.map((m) => {
                    const isChecked = selectedSplits.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleSplitMember(m)}
                        className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium transition ${
                          isChecked
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                            : 'border-stone-200 bg-stone-100 text-stone-400'
                        }`}
                      >
                        {isChecked ? '✓ ' : ''}{m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-stone-700">
                    {zh ? '实际已经支付了多少' : 'Actual payment contributions'}
                  </div>
                  <div className="mt-0.5 text-[9.5px] text-stone-400">
                    {zh ? '默认主要垫付人支付全额；若有人当场付回或多人一起付款，可按人记录金额。' : 'Defaults to one payer; record per-person amounts for reimbursements or shared payment.'}
                  </div>
                </div>
                {paymentDraft === null ? (
                  <button
                    type="button"
                    onClick={startMultiPayment}
                    className="shrink-0 rounded-md border border-stone-300 bg-white px-2 py-1 text-[10px] font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    + {zh ? '多人支付' : 'Multiple payers'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPaymentDraft(null)}
                    className="shrink-0 rounded-md border border-stone-300 bg-white px-2 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    {zh ? '恢复一人垫付' : 'One payer'}
                  </button>
                )}
              </div>

              {paymentDraft === null ? (
                <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold text-stone-700 ring-1 ring-stone-200">
                  {paidBy} · {currency} {parsedExpenseAmount.toLocaleString()}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {members.map((member) => (
                      <label key={member} className="rounded-md border border-stone-200 bg-white p-1.5">
                        <span className="block truncate text-[10px] font-semibold text-stone-600">{member}</span>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-[9px] text-stone-400">{currency}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={paymentDraft[member] ?? ''}
                            onChange={(e) => setPaymentDraft((prev) => ({ ...(prev ?? {}), [member]: e.target.value }))}
                            placeholder="0"
                            className="min-w-0 flex-1 rounded border border-stone-200 px-1 py-0.5 text-right text-[10.5px] font-semibold outline-hidden focus:border-emerald-500"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={fillEqualPayments}
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      {zh ? '按分摊成员均分已付' : 'Fill equal contributions'}
                    </button>
                    <span className={`text-[10px] font-semibold ${paymentDraftValid ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {zh ? '已录入' : 'Recorded'} {currency} {paymentTotal.toLocaleString()} / {parsedExpenseAmount.toLocaleString()}
                      {!paymentDraftValid ? ` · ${paymentDifference > 0 ? (zh ? '还差' : 'missing') : (zh ? '超出' : 'over')} ${Math.abs(paymentDifference).toLocaleString()}` : ' ✓'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-500">
                {zh ? '备注 / 账目说明 (可选)' : 'Notes / Remarks (Optional)'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={zh ? '如: 含服务费、打车小费等' : 'e.g. Service fee included'}
                className="mt-1 w-full rounded-lg border border-stone-300 p-1.5 text-xs outline-hidden focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={!paymentDraftValid}
              className="w-full rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              ✓ {zh ? '保存该笔花费' : 'Save Expense'}
            </button>
          </form>
        ) : null}

        <div className="mt-3 space-y-1.5">
          {expenses.length === 0 ? (
            <p className="py-4 text-center text-xs italic text-stone-400">
              {zh ? '暂无账目，点击上方“+ 记一笔”快速录入' : 'No expenses recorded yet'}
            </p>
          ) : expensesWithPayments.map(renderExpenseItem)}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-stone-800">
            <span>⚖️</span>
            <span>{zh ? 'AA 拆账与最简清账' : 'AA Debt Settlement'}</span>
          </div>
          {settlement.transfers.length > 0 ? (
            <button
              type="button"
              onClick={() => void copySettlementText()}
              className="rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700 shadow-2xs hover:bg-stone-100"
            >
              📋 {zh ? '一键复制发群' : 'Copy Text'}
            </button>
          ) : null}
        </div>

        {copyNotice ? (
          <div className="mt-2 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 animate-in fade-in">
            {copyNotice}
          </div>
        ) : null}

        {expenses.length === 0 ? (
          <div className="mt-3 rounded-lg border border-stone-100 bg-stone-50 p-3 text-xs text-stone-500">
            {zh ? '暂无账目。录入消费后，这里会根据“应分摊金额”和“每人实际已支付金额”自动算出剩余转账。' : 'No expenses yet. Settlement is calculated from each member’s share versus actual payments.'}
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {settlement.memberBalances.map((mb) => {
                const isCreditor = mb.netBalance > 0.01;
                const isDebtor = mb.netBalance < -0.01;
                return (
                  <div
                    key={mb.member}
                    className={`rounded-lg border p-2 text-xs ${
                      isCreditor
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : isDebtor
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-stone-200 bg-stone-50'
                    }`}
                  >
                    <div className="truncate font-semibold text-stone-900">{mb.member}</div>
                    <div className="mt-0.5 text-[10.5px] text-stone-500">
                      {zh ? '已付' : 'Paid'}: {baseCurrency}{mb.paidTotal} | {zh ? '应摊' : 'Share'}: {baseCurrency}{mb.shareTotal}
                    </div>
                    <div className={`mt-1 text-xs font-bold ${isCreditor ? 'text-emerald-700' : isDebtor ? 'text-rose-700' : 'text-stone-500'}`}>
                      {isCreditor
                        ? `+ ${baseCurrency}${mb.netBalance} (${zh ? '待收款' : 'to receive'})`
                        : isDebtor
                        ? `- ${baseCurrency}${Math.abs(mb.netBalance)} (${zh ? '待支付' : 'to pay'})`
                        : (zh ? '已结清' : 'Settled')}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 rounded-lg border border-stone-100 bg-stone-50 p-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-stone-600">
                🎯 {zh ? `剩余最简转账路径 (${settlement.transfers.length} 笔):` : `Remaining optimal transfers (${settlement.transfers.length}):`}
              </div>

              {settlement.transfers.length === 0 ? (
                <p className="text-xs font-medium italic text-emerald-700">
                  🎉 {zh ? '按当前已支付金额，全员账目已经持平，无需再转账。' : 'Current payment contributions already settle all balances.'}
                </p>
              ) : (
                <div className="space-y-1 text-xs">
                  {settlement.transfers.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border border-stone-200/60 bg-white px-2.5 py-1.5 font-medium text-stone-800 shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">{t.from}</span>
                        <span className="text-stone-400">{zh ? '👉 转账给' : '👉 Transfer to'}</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{t.to}</span>
                      </div>
                      <strong className="font-bold text-emerald-800">
                        {baseCurrency} {t.amount.toLocaleString()}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
