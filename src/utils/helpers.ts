export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
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

export function getPLColor(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-slate-400';
}

export function getPLBgColor(value: number): string {
  if (value > 0) return 'bg-emerald-500/10 border-emerald-500/20';
  if (value < 0) return 'bg-red-500/10 border-red-500/20';
  return 'bg-slate-500/10 border-slate-500/20';
}
