import type { PostScheme } from '../types';

export const SCHEME_INFO: Record<PostScheme, { label: string; term: number; rate: number }> = {
  NSC:  { label: 'National Savings Certificate',   term: 5,    rate: 7.7 },
  KVP:  { label: 'Kisan Vikas Patra',              term: 9.65, rate: 7.5 },
  MIS:  { label: 'Monthly Income Scheme',          term: 5,    rate: 7.4 },
  TD:   { label: 'Time Deposit',                   term: 5,    rate: 7.5 },
  SCSS: { label: 'Senior Citizens Savings Scheme', term: 5,    rate: 8.2 },
  RD:   { label: 'Recurring Deposit',             term: 5,    rate: 6.7 },
  SSY:  { label: 'Sukanya Samriddhi Yojana',       term: 21,   rate: 8.2 },
};

export const SCHEME_COLORS: Record<PostScheme, string> = {
  NSC:  'bg-blue-500/10 text-blue-400',
  KVP:  'bg-green-500/10 text-green-400',
  MIS:  'bg-amber-500/10 text-warn',
  TD:   'bg-indigo-500/10 text-accent',
  SCSS: 'bg-orange-500/10 text-orange-400',
  RD:   'bg-purple-500/10 text-purple-400',
  SSY:  'bg-pink-500/10 text-pink-400',
};

export function calcMaturityDate(startDate: string, scheme: PostScheme): string {
  if (!startDate) return '';
  const d = new Date(startDate);
  if (scheme === 'KVP') {
    d.setMonth(d.getMonth() + 115);
  } else {
    d.setFullYear(d.getFullYear() + SCHEME_INFO[scheme].term);
  }
  return d.toISOString().split('T')[0];
}

export function calcMaturityAmount(
  scheme: PostScheme,
  principal: number,
  rate: number,
  monthlyDeposit: number,
  startDate: string,
  maturityDate: string,
): number {
  if (scheme === 'MIS') return principal;
  if (scheme === 'RD') {
    const months = startDate && maturityDate
      ? Math.max(1, Math.round((new Date(maturityDate).getTime() - new Date(startDate).getTime()) / (30.44 * 24 * 3600 * 1000)))
      : 60;
    const r = rate / 1200;
    return r > 0 ? Math.round(monthlyDeposit * ((Math.pow(1 + r, months) - 1) / r) * (1 + r)) : monthlyDeposit * months;
  }
  if (scheme === 'KVP') return principal * 2;
  const years = SCHEME_INFO[scheme].term;
  return Math.round(principal * Math.pow(1 + rate / 100, years));
}

export function postTotalInvested(p: { scheme: PostScheme; principal: number; monthlyDeposit: number; startDate: string; maturityDate: string }): number {
  if (p.scheme === 'RD' && p.monthlyDeposit > 0) {
    const months = p.startDate && p.maturityDate
      ? Math.max(1, Math.round((new Date(p.maturityDate).getTime() - new Date(p.startDate).getTime()) / (30.44 * 24 * 3600 * 1000)))
      : 60;
    return p.monthlyDeposit * months;
  }
  return p.principal;
}
