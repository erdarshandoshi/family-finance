import { useTheme } from '../context/ThemeContext';

// Shared, theme-aware chart styling so every chart reads as one system in both
// light and dark mode. Recharts needs concrete colours, so we resolve them from
// the current theme rather than hardcoding dark hex.
export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipStyle: React.CSSProperties;
  tooltipItem: React.CSSProperties;
  tooltipLabel: React.CSSProperties;
  series: string[];
  positive: string;
  negative: string;
  accent: string;
}

const SERIES_LIGHT = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#0d9488'];
const SERIES_DARK  = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return {
    grid: dark ? '#1e293b' : '#e5e9f0',
    axis: dark ? '#94a3b8' : '#64748b',
    tooltipStyle: {
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      border: `1px solid ${dark ? '#334155' : '#e5e9f0'}`,
      borderRadius: 10,
      boxShadow: dark ? '0 6px 20px rgba(0,0,0,0.45)' : '0 6px 20px rgba(15,23,42,0.12)',
      color: dark ? '#f1f5f9' : '#0f172a',
      fontSize: 12,
    },
    tooltipItem:  { color: dark ? '#f1f5f9' : '#0f172a' },
    tooltipLabel: { color: dark ? '#94a3b8' : '#64748b', fontWeight: 600, marginBottom: 2 },
    series: dark ? SERIES_DARK : SERIES_LIGHT,
    positive: dark ? '#10b981' : '#059669',
    negative: dark ? '#ef4444' : '#dc2626',
    accent:   dark ? '#6366f1' : '#4f46e5',
  };
}

// Compact ₹ axis formatter (₹1.2Cr / ₹45L / ₹12k)
export function inrAxis(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n.toFixed(0)}`;
}
