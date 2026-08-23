'use client';

import { useMemo, useState } from 'react';
import type { PlannerTrip, PlannerTripPlace, TripExpenseCategory, TripExpenseItem } from '@/domain/planner';
import { calculateTripSettlement, estimateTripBudget } from '@/domain/planner';

interface PlannerBudgetLedgerProps {
  trip: PlannerTrip;
  scheduledPlaces: PlannerTripPlace[];
  expenses: TripExpenseItem[];
  onAddExpense: (expense: Omit<TripExpenseItem, 'id' | 'created_at'>) => void;
  onDeleteExpense: (expenseId: string) => void;
  members: string[];
  onUpdateMembers: (members: string[]) => void;
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

export function PlannerBudgetLedger({
  trip,
  scheduledPlaces,
  expenses,
  onAddExpense,
  onDeleteExpense,
  members,
  onUpdateMembers,
  language = 'zh',
}: PlannerBudgetLedgerProps) {
  const zh = language === 'zh';

  // New expense form state
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState(trip.currency || 'CNY');
  const [category, setCategory] = useState<TripExpenseCategory>('food');
  const [paidBy, setPaidBy] = useState(members[0] || (zh ? '我' : 'Me'));
  const [selectedSplits, setSelectedSplits] = useState<string[]>(members);
  const [notes, setNotes] = useState('');

  // Member management state
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  // Auto Budget Estimation
  const budgetEstimation = useMemo(() => {
    return estimateTripBudget(scheduledPlaces, members.length || 1, currency);
  }, [scheduledPlaces, members.length, currency]);

  // AA Settlement calculation
  const settlement = useMemo(() => {
    return calculateTripSettlement(expenses, members);
  }, [expenses, members]);

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMemberName.trim();
    if (!trimmed || members.includes(trimmed)) return;
    const next = [...members, trimmed];
    onUpdateMembers(next);
    setSelectedSplits(next);
    setNewMemberName('');
    setIsAddingMember(false);
  };

  const handleRemoveMember = (name: string) => {
    if (members.length <= 1) return;
    const next = members.filter((m) => m !== name);
    onUpdateMembers(next);
    setSelectedSplits((prev) => prev.filter((m) => m !== name));
  };

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountStr);
    if (!title.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    onAddExpense({
      trip_id: trip.id,
      title: title.trim(),
      category,
      amount: parsedAmount,
      currency,
      paid_by: paidBy || members[0] || (zh ? '我' : 'Me'),
      split_members: selectedSplits.length > 0 ? selectedSplits : members,
      notes: notes.trim() || undefined,
    });

    setTitle('');
    setAmountStr('');
    setNotes('');
    setIsAddingExpense(false);
  };

  const copySettlementText = async () => {
    await navigator.clipboard.writeText(settlement.summaryText);
    setCopyNotice(zh ? '✓ 已复制 AA 结账清单，可直接发微信群！' : '✓ Copied settlement text to clipboard!');
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

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3 text-stone-900">
      {/* 1. Travel Companion Member Bar */}
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
          <form onSubmit={handleAddMember} className="mt-2 flex gap-1.5">
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
                  className="text-stone-400 hover:text-rose-600 text-[10px]"
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {/* 2. Budget Estimation vs Actual Spending Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-2xs">
          <span className="text-[11px] font-medium text-emerald-800">
            {zh ? '💰 全程预估预算' : 'Estimated Budget'}
          </span>
          <div className="mt-1 text-base font-extrabold text-emerald-950">
            {currency} {budgetEstimation.totalEstimated.toLocaleString()}
          </div>
          <p className="mt-0.5 text-[10px] text-emerald-700">
            {zh
              ? `基于已排日程 (人均 ${currency} ${budgetEstimation.perPersonEstimated.toLocaleString()})`
              : `Per person ${currency} ${budgetEstimation.perPersonEstimated.toLocaleString()}`}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
          <span className="text-[11px] font-medium text-stone-500">
            {zh ? '💸 已记录支出' : 'Total Spent'}
          </span>
          <div className="mt-1 text-base font-extrabold text-stone-900">
            {currency} {settlement.totalExpense.toLocaleString()}
          </div>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {zh
              ? `人均已支出 ${currency} ${members.length > 0 ? Math.round(settlement.totalExpense / members.length).toLocaleString() : 0}`
              : `Per person ${members.length > 0 ? Math.round(settlement.totalExpense / members.length).toLocaleString() : 0}`}
          </p>
        </div>
      </div>

      {/* 3. Fast Expense Entry Drawer / Button */}
      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-stone-800">
            {zh ? '📝 记账与垫付流水' : 'Expense Ledger'}
          </span>
          <button
            type="button"
            onClick={() => setIsAddingExpense(!isAddingExpense)}
            className="rounded-lg bg-stone-950 px-2.5 py-1 text-xs font-semibold text-white hover:bg-stone-800 transition"
          >
            {isAddingExpense ? (zh ? '✕ 收起' : '✕ Close') : (zh ? '+ 记一笔' : '+ Add Expense')}
          </button>
        </div>

        {isAddingExpense ? (
          <form onSubmit={handleSubmitExpense} className="mt-3 space-y-3 border-t border-stone-100 pt-3">
            {/* Category Chips */}
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
                        isSelected
                          ? 'bg-stone-900 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {meta.icon} {zh ? meta.zh : meta.en}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title & Amount */}
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
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-16 rounded-lg border border-stone-300 bg-stone-50 px-1 text-xs"
                  >
                    {COMMON_CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
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

            {/* Payer & Split Members */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-stone-500">
                  {zh ? '谁垫付的' : 'Paid By'}
                </label>
                <select
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 p-1.5 text-xs font-medium"
                >
                  {members.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
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
                        className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition ${
                          isChecked
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-stone-100 text-stone-400 border border-stone-200'
                        }`}
                      >
                        {isChecked ? '✓ ' : ''}{m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-600 transition"
            >
              ✓ {zh ? '保存该笔花费' : 'Save Expense'}
            </button>
          </form>
        ) : null}

        {/* Expense List */}
        <div className="mt-3 space-y-1.5">
          {expenses.length === 0 ? (
            <p className="py-4 text-center text-xs text-stone-400 italic">
              {zh ? '暂无账目，点击上方“+ 记一笔”快速录入' : 'No expenses recorded yet'}
            </p>
          ) : (
            expenses.map((item) => {
              const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/70 p-2 text-xs hover:bg-stone-100/60 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{cat.icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 truncate">{item.title}</div>
                      <div className="text-[10px] text-stone-400">
                        {item.paid_by} {zh ? '垫付' : 'paid'} · {item.split_members.length}{zh ? '人平摊' : ' split'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <strong className="text-stone-900 font-bold">
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
            })
          )}
        </div>
      </div>

      {/* 4. Minimum Cash Flow AA Settlement Panel */}
      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
            <span>⚖️</span>
            <span>{zh ? 'AA 拆账与最简清账' : 'AA Debt Settlement'}</span>
          </div>
          {settlement.transfers.length > 0 ? (
            <button
              type="button"
              onClick={() => void copySettlementText()}
              className="rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 shadow-2xs"
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

        {/* Member Balances */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {settlement.memberBalances.map((mb) => {
            const isCreditor = mb.netBalance > 0.01;
            const isDebtor = mb.netBalance < -0.01;
            return (
              <div
                key={mb.member}
                className={`rounded-lg p-2 text-xs border ${
                  isCreditor
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : isDebtor
                    ? 'border-rose-200 bg-rose-50/50'
                    : 'border-stone-200 bg-stone-50'
                }`}
              >
                <div className="font-semibold text-stone-900 truncate">{mb.member}</div>
                <div className="mt-0.5 text-[10.5px] text-stone-500">
                  {zh ? '付' : 'Paid'}: {currency}{mb.paidTotal} | {zh ? '摊' : 'Share'}: {currency}{mb.shareTotal}
                </div>
                <div
                  className={`mt-1 font-bold text-xs ${
                    isCreditor
                      ? 'text-emerald-700'
                      : isDebtor
                      ? 'text-rose-700'
                      : 'text-stone-500'
                  }`}
                >
                  {isCreditor ? `+ ${currency}${mb.netBalance} (待收款)` : isDebtor ? `- ${currency}${Math.abs(mb.netBalance)} (待支付)` : (zh ? '已结清' : 'Settled')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Transfer Path Directives */}
        <div className="mt-3 rounded-lg border border-stone-100 bg-stone-50 p-2.5">
          <div className="text-[11px] font-semibold text-stone-600 mb-1.5">
            🎯 {zh ? `最简转账路径 (仅需 ${settlement.transfers.length} 笔转账即可全部结清):` : `Optimal Transfers (${settlement.transfers.length} payments):`}
          </div>

          {settlement.transfers.length === 0 ? (
            <p className="text-xs text-emerald-700 font-medium italic">
              🎉 {zh ? '当前全员账目已完全结清，无需任何转账！' : 'All accounts are settled!'}
            </p>
          ) : (
            <div className="space-y-1 text-xs">
              {settlement.transfers.map((t, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 font-medium text-stone-800 shadow-2xs border border-stone-200/60"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-rose-100 text-rose-800 px-1.5 py-0.2 text-[10px] font-bold">
                      {t.from}
                    </span>
                    <span className="text-stone-400">👉 转账给</span>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-bold">
                      {t.to}
                    </span>
                  </div>
                  <strong className="text-emerald-800 font-bold">
                    {currency} {t.amount.toLocaleString()}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
