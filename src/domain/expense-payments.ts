import {
  currencySymbolFor,
  effectiveFxRate,
  type CashFlowTransfer,
  type FxSettings,
  type MemberBalance,
  type TripExpenseItem,
  type TripSettlementResult,
} from './planner';

export interface ExpensePaymentContribution {
  member: string;
  amount: number;
}

export interface TripExpenseWithPayments extends TripExpenseItem {
  /** Actual contribution toward this expense in the expense currency. */
  payments?: ExpensePaymentContribution[];
}

const LEGACY_SETTLED_CONFIRMATION = 'settled';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupPayments(payments: ExpensePaymentContribution[]): ExpensePaymentContribution[] {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    const member = payment.member?.trim();
    if (!member || !Number.isFinite(payment.amount) || payment.amount <= 0) continue;
    totals.set(member, roundMoney((totals.get(member) ?? 0) + payment.amount));
  }
  return [...totals.entries()].map(([member, amount]) => ({ member, amount }));
}

/**
 * Resolve the economic contribution for one expense.
 *
 * New records use `payments`. Legacy records remain readable:
 * - `confirmation: settled` => every split member already contributed an equal share;
 * - otherwise the legacy `paid_by` member contributed the full amount.
 *
 * If a new payment list omits part of the total, the remainder is attributed to
 * `paid_by`, which matches the common "I paid first, others paid me back" flow.
 */
export function resolveExpensePayments(expense: TripExpenseWithPayments): ExpensePaymentContribution[] {
  const amount = Number.isFinite(expense.amount) && expense.amount > 0 ? expense.amount : 0;
  const explicit = groupPayments(expense.payments ?? []);

  if (explicit.length > 0 && amount > 0) {
    const explicitTotal = roundMoney(explicit.reduce((sum, payment) => sum + payment.amount, 0));

    // Corrupted/ambiguous over-payment should not distort the ledger. Fall back
    // to the authoritative legacy payer rather than creating money from nowhere.
    if (explicitTotal > amount + 0.01) {
      return [{ member: expense.paid_by?.trim() || 'Unknown', amount }];
    }

    const remainder = roundMoney(amount - explicitTotal);
    if (remainder > 0.01) {
      const payer = expense.paid_by?.trim() || explicit[0].member;
      return groupPayments([...explicit, { member: payer, amount: remainder }]);
    }
    return explicit;
  }

  const splits = (expense.split_members ?? []).map((member) => member?.trim()).filter(Boolean) as string[];
  if (expense.confirmation === LEGACY_SETTLED_CONFIRMATION && amount > 0 && splits.length > 0) {
    const perMember = amount / splits.length;
    return splits.map((member, index) => ({
      member,
      amount: index === splits.length - 1
        ? roundMoney(amount - roundMoney(perMember) * (splits.length - 1))
        : roundMoney(perMember),
    }));
  }

  return amount > 0
    ? [{ member: expense.paid_by?.trim() || splits[0] || 'Unknown', amount }]
    : [];
}

export function calculateTripSettlementWithPayments(
  expenses: TripExpenseWithPayments[],
  allMembers: string[] = [],
  fx?: FxSettings,
): TripSettlementResult {
  const toBase = (amount: number, from?: string): number => {
    if (!fx) return amount;
    const rate = effectiveFxRate(from, fx);
    return rate === null ? amount : roundMoney(amount * rate);
  };

  const memberSet = new Set<string>(allMembers.map((member) => member.trim()).filter(Boolean));
  expenses.forEach((expense) => {
    if (expense.paid_by?.trim()) memberSet.add(expense.paid_by.trim());
    (expense.split_members ?? []).forEach((member) => {
      if (member?.trim()) memberSet.add(member.trim());
    });
    resolveExpensePayments(expense).forEach((payment) => memberSet.add(payment.member));
  });

  const members = [...memberSet];
  if (members.length === 0 || expenses.length === 0) {
    return {
      totalExpense: 0,
      memberBalances: [],
      transfers: [],
      summaryText: '暂无账目流水记录。',
    };
  }

  const paidMap: Record<string, number> = {};
  const shareMap: Record<string, number> = {};
  members.forEach((member) => {
    paidMap[member] = 0;
    shareMap[member] = 0;
  });

  let totalExpense = 0;

  expenses.forEach((expense) => {
    const amount = toBase(expense.amount, expense.currency);
    totalExpense += amount;

    resolveExpensePayments(expense).forEach((payment) => {
      const converted = toBase(payment.amount, expense.currency);
      paidMap[payment.member] = (paidMap[payment.member] ?? 0) + converted;
    });

    const splits = (expense.split_members ?? []).map((member) => member?.trim()).filter(Boolean) as string[];
    const effectiveSplits = splits.length > 0 ? splits : members;
    const perShare = effectiveSplits.length > 0 ? amount / effectiveSplits.length : 0;
    effectiveSplits.forEach((member) => {
      shareMap[member] = (shareMap[member] ?? 0) + perShare;
    });
  });

  const memberBalances: MemberBalance[] = members.map((member) => {
    const paidTotal = roundMoney(paidMap[member] ?? 0);
    const shareTotal = roundMoney(shareMap[member] ?? 0);
    return {
      member,
      paidTotal,
      shareTotal,
      netBalance: roundMoney(paidTotal - shareTotal),
    };
  });

  const balances: Record<string, number> = {};
  memberBalances.forEach((balance) => {
    balances[balance.member] = balance.netBalance;
  });

  const transfers: CashFlowTransfer[] = [];
  while (true) {
    let creditor: string | null = null;
    let credit = 0.01;
    let debtor: string | null = null;
    let debt = -0.01;

    for (const [member, balance] of Object.entries(balances)) {
      if (balance > credit) {
        creditor = member;
        credit = balance;
      }
      if (balance < debt) {
        debtor = member;
        debt = balance;
      }
    }

    if (!creditor || !debtor) break;
    const amount = roundMoney(Math.min(credit, -debt));
    if (amount <= 0.01) break;

    transfers.push({ from: debtor, to: creditor, amount });
    balances[creditor] = roundMoney(balances[creditor] - amount);
    balances[debtor] = roundMoney(balances[debtor] + amount);
  }

  const baseCurrency = fx?.base?.trim().toUpperCase();
  const symbol = currencySymbolFor(baseCurrency ?? expenses[0]?.currency);
  const lines = [
    '✈️ 旅行费用 AA 清算账单',
    `💰 总支出: ${symbol}${roundMoney(totalExpense)} (共 ${members.length} 人)`,
    '------------------------------',
  ];

  if (transfers.length === 0) {
    lines.push('🎉 全员账目已完全持平，无需任何转账！');
  } else {
    transfers.forEach((transfer, index) => {
      lines.push(`${index + 1}. ${transfer.from} 👉 微信转账给 ${transfer.to}: ${symbol}${transfer.amount}`);
    });
  }

  return {
    totalExpense: roundMoney(totalExpense),
    memberBalances,
    transfers,
    summaryText: lines.join('\n'),
  };
}
