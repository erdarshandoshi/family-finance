import type { Stock } from '../types';

export interface StockGroup {
  key: string;
  isin: string;
  symbol: string;
  stockName: string;
  memberId: string;
  dematAccount: string;    // demat for demat-specific groups; first demat for combined
  dematAccounts: string[]; // all unique demat accounts in this group
  currentPrice: number;
  lots: Stock[];
  totalQty: number;
  avgPrice: number;
  totalInvested: number;
  totalCurrent: number;
  pl: number;
  plPct: number;
  earliestDate: string;
  daysHeld: number;
  annualizedReturn: number;
}

function buildGroup(key: string, lots: Stock[], dematAccount: string, dematAccounts: string[]): StockGroup {
  const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
  const totalInvested = lots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0);
  const avgPrice = totalQty > 0 ? totalInvested / totalQty : 0;
  const currentPrice = lots[0].currentPrice;
  const totalCurrent = totalQty * currentPrice;
  const pl = totalCurrent - totalInvested;
  const plPct = totalInvested > 0 ? (pl / totalInvested) * 100 : 0;

  const earliestDate = lots
    .map(l => l.dateOfPurchase)
    .filter(Boolean)
    .sort()[0] ?? '';

  const daysHeld = earliestDate
    ? Math.max(1, Math.floor((Date.now() - new Date(earliestDate).getTime()) / 86_400_000))
    : 1;

  const annualizedReturn =
    totalInvested > 0 && totalCurrent > 0
      ? (Math.pow(totalCurrent / totalInvested, 365 / daysHeld) - 1) * 100
      : 0;

  return {
    key,
    isin: lots[0].isin,
    symbol: lots[0].symbol,
    stockName: lots[0].stockName,
    memberId: lots[0].memberId,
    dematAccount,
    dematAccounts,
    currentPrice,
    lots,
    totalQty,
    avgPrice,
    totalInvested,
    totalCurrent,
    pl,
    plPct,
    earliestDate,
    daysHeld,
    annualizedReturn,
  };
}

// Groups by isin+member only — combined totals for "All Accounts" display
export function groupStocks(stocks: Stock[]): StockGroup[] {
  const grouped = new Map<string, Stock[]>();
  for (const stock of stocks) {
    const key = `${stock.isin || stock.symbol}__${stock.memberId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(stock);
  }
  return Array.from(grouped.values()).map(lots => {
    const dematAccounts = [...new Set(lots.map(l => l.dematAccount ?? 'KIFS'))].sort();
    const key = `${lots[0].isin || lots[0].symbol}__${lots[0].memberId}`;
    return buildGroup(key, lots, dematAccounts[0], dematAccounts);
  });
}

// Groups by isin+member+demat — for demat-filtered display and editing
export function groupStocksByDemat(stocks: Stock[]): StockGroup[] {
  const grouped = new Map<string, Stock[]>();
  for (const stock of stocks) {
    const demat = stock.dematAccount ?? 'KIFS';
    const key = `${stock.isin || stock.symbol}__${stock.memberId}__${demat}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(stock);
  }
  return Array.from(grouped.values()).map(lots => {
    const demat = lots[0].dematAccount ?? 'KIFS';
    const key = `${lots[0].isin || lots[0].symbol}__${lots[0].memberId}__${demat}`;
    return buildGroup(key, lots, demat, [demat]);
  });
}
