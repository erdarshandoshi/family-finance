export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Compact form: ₹1.23 Cr / ₹45.6 L / ₹12,345 — fits in tight spaces like KPI cards
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  return formatCurrency(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function isMaturityThisMonth(maturityDate: string): boolean {
  const today = new Date();
  const maturity = new Date(maturityDate);
  return (
    maturity.getFullYear() === today.getFullYear() &&
    maturity.getMonth() === today.getMonth()
  );
}

export function isMatured(maturityDate: string): boolean {
  return new Date(maturityDate) < new Date();
}

export function daysUntilMaturity(maturityDate: string): number {
  const today = new Date();
  const maturity = new Date(maturityDate);
  return Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function timeUntilDate(dateStr: string): string {
  if (!dateStr) return '—';
  const target = new Date(dateStr);
  const now = new Date();
  if (target <= now) return 'Matured';

  let years = target.getFullYear() - now.getFullYear();
  let months = target.getMonth() - now.getMonth();
  if (months < 0) { years -= 1; months += 12; }

  if (years > 0 && months > 0) return `${years}yr ${months}mo`;
  if (years > 0) return `${years}yr`;
  if (months > 0) return `${months}mo`;
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  return `${days}d`;
}

export function daysToHumanDuration(days: number): string {
  if (days <= 0) return '< 1d';
  const yrs = Math.floor(days / 365);
  const mos = Math.floor((days % 365) / 30);
  const ds = Math.floor(days % 365 % 30);
  if (yrs > 0 && mos > 0) return `${yrs}yr ${mos}mo`;
  if (yrs > 0) return `${yrs}yr`;
  if (mos > 0 && ds > 0) return `${mos}mo ${ds}d`;
  if (mos > 0) return `${mos}mo`;
  return `${ds}d`;
}

export function getPLColor(value: number): string {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return 'text-muted';
}

export function getPLBgColor(value: number): string {
  if (value > 0) return 'bg-emerald-500/10 border-emerald-500/20';
  if (value < 0) return 'bg-red-500/10 border-red-500/20';
  return 'bg-slate-500/10 border-edge';
}
