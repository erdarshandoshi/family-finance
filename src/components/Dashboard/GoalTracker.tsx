import { useState } from 'react';
import { Target, Pencil, Check, X } from 'lucide-react';
import type { Goals, AssetKey } from '../../types';
import { formatCurrency, formatCompact } from '../../utils/helpers';

interface AllocItem { key: AssetKey; name: string; value: number; }
interface Props {
  goals: Goals;
  currentTotal: number;
  alloc: AllocItem[];
  onSave: (g: Goals) => void;
}

const ASSETS: { key: AssetKey; label: string }[] = [
  { key: 'fd', label: 'FD' }, { key: 'stocks', label: 'Stocks' }, { key: 'mf', label: 'MF/SIP' },
  { key: 'ppf', label: 'PPF' }, { key: 'pf', label: 'EPF' }, { key: 'post', label: 'Post' }, { key: 'nps', label: 'NPS' },
];

const inputCls = 'w-full bg-surface2 border border-edge rounded-xl px-3 py-2 text-content text-sm outline-none focus:border-indigo-500';

export default function GoalTracker({ goals, currentTotal, alloc, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const total = alloc.reduce((s, a) => s + a.value, 0);
  const actualPct = (k: AssetKey) => (total > 0 ? ((alloc.find(a => a.key === k)?.value ?? 0) / total) * 100 : 0);

  const target = goals.netWorthTarget ?? 0;
  const progress = target > 0 ? Math.min(100, (currentTotal / target) * 100) : 0;
  const hasTargets = goals.targetAllocation && Object.keys(goals.targetAllocation).length > 0;

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-accent" />
          <h3 className="text-content font-semibold text-sm">Goals & Targets</h3>
        </div>
        <button onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-accent hover:opacity-80 text-xs transition-opacity">
          <Pencil size={12} /> Edit
        </button>
      </div>

      {target <= 0 && !hasTargets ? (
        <div className="text-center py-6">
          <p className="text-muted text-sm">Set a net-worth goal and target allocation to track progress.</p>
          <button onClick={() => setEditing(true)}
            className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-xl transition-colors">
            Set goals
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {target > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-muted text-xs">Net-worth goal</span>
                <span className="text-content text-xs font-medium">
                  {formatCompact(currentTotal)} / {formatCompact(target)}
                  {goals.targetDate && <span className="text-faint"> · by {new Date(goals.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}
                </span>
              </div>
              <div className="h-2.5 bg-surface3 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
                  style={{ width: `${progress}%` }} />
              </div>
              <p className="text-faint text-xs mt-1">
                {progress >= 100 ? '🎉 Goal reached!' : `${progress.toFixed(1)}% there · ${formatCurrency(Math.max(0, target - currentTotal))} to go`}
              </p>
            </div>
          )}

          {hasTargets && (
            <div>
              <p className="text-muted text-xs mb-2">Target allocation vs actual</p>
              <div className="space-y-2">
                {ASSETS.filter(a => (goals.targetAllocation?.[a.key] ?? 0) > 0).map(a => {
                  const tgt = goals.targetAllocation![a.key]!;
                  const act = actualPct(a.key);
                  const drift = act - tgt;
                  return (
                    <div key={a.key}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted">{a.label}</span>
                        <span className="text-content font-medium">
                          {act.toFixed(0)}% <span className="text-faint">/ {tgt}%</span>
                          <span className={`ml-1.5 ${Math.abs(drift) <= 5 ? 'text-success' : 'text-warn'}`}>
                            ({drift >= 0 ? '+' : ''}{drift.toFixed(0)})
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-surface3 rounded-full relative">
                        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, act)}%` }} />
                        <span className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-content/50" style={{ left: `${Math.min(100, tgt)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-faint text-xs mt-2">Tick mark = target · bar = actual · (drift in points)</p>
            </div>
          )}
        </div>
      )}

      {editing && (
        <GoalEditor goals={goals} onCancel={() => setEditing(false)}
          onSave={g => { onSave(g); setEditing(false); }} />
      )}
    </div>
  );
}

function GoalEditor({ goals, onSave, onCancel }: { goals: Goals; onSave: (g: Goals) => void; onCancel: () => void }) {
  const [targetStr, setTargetStr] = useState(goals.netWorthTarget ? String(goals.netWorthTarget) : '');
  const [date, setDate] = useState(goals.targetDate ?? '');
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const a of ASSETS) o[a.key] = goals.targetAllocation?.[a.key] != null ? String(goals.targetAllocation![a.key]) : '';
    return o;
  });

  const sum = ASSETS.reduce((s, a) => s + (parseFloat(alloc[a.key]) || 0), 0);

  const save = () => {
    const targetAllocation: Partial<Record<AssetKey, number>> = {};
    for (const a of ASSETS) { const v = parseFloat(alloc[a.key]); if (v > 0) targetAllocation[a.key] = v; }
    onSave({
      netWorthTarget: parseFloat(targetStr) || undefined,
      targetDate: date || undefined,
      targetAllocation: Object.keys(targetAllocation).length ? targetAllocation : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-surface border border-edge rounded-2xl shadow-card p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-content font-semibold flex items-center gap-2"><Target size={16} className="text-accent" /> Set Goals</h3>
          <button onClick={onCancel} className="p-1.5 text-faint hover:text-content rounded-lg"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-muted text-xs mb-1.5 block">Net-worth target (₹)</label>
            <input type="number" value={targetStr} onChange={e => setTargetStr(e.target.value)}
              placeholder="e.g. 10000000" className={inputCls} />
          </div>
          <div>
            <label className="text-muted text-xs mb-1.5 block">Target date (optional)</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-muted text-xs">Target allocation % (optional)</label>
              <span className={`text-xs font-medium ${Math.abs(sum - 100) < 0.5 ? 'text-success' : sum > 0 ? 'text-warn' : 'text-faint'}`}>
                {sum}% total
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ASSETS.map(a => (
                <div key={a.key} className="flex items-center gap-2">
                  <span className="text-muted text-xs w-14">{a.label}</span>
                  <input type="number" value={alloc[a.key]} onChange={e => setAlloc(p => ({ ...p, [a.key]: e.target.value }))}
                    placeholder="0" className="flex-1 bg-surface2 border border-edge rounded-lg px-2 py-1.5 text-content text-xs outline-none focus:border-indigo-500" />
                </div>
              ))}
            </div>
          </div>
          <button onClick={save}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
            <Check size={16} /> Save Goals
          </button>
        </div>
      </div>
    </div>
  );
}
