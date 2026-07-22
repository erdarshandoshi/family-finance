import { useState } from 'react';
import { Plus, Edit2, Trash2, FolderKey, Search, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { generateId } from '../utils/helpers';
import { resolveSchemeCode, searchSchemes, type SchemeMatch } from '../utils/mfNav';
import type { FolioMapping } from '../types';
import Modal from '../components/common/Modal';

const BLANK = (memberId: string): FolioMapping => ({
  id: '', folioNumber: '', amc: '', schemeName: '', schemeCode: '',
  memberId, guardianMemberId: '', isSIP: true, sipAmount: undefined,
});

export default function FolioRegistryPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [editing, setEditing] = useState<FolioMapping | null>(null);

  const mappings = data.folioMappings ?? [];
  const memberName = (id?: string) => data.members.find(m => m.id === id)?.name ?? '—';

  const handleDelete = (m: FolioMapping) => {
    if (window.confirm(`Remove folio mapping ${m.folioNumber} (${m.schemeName})?`)) {
      dispatch({ type: 'DELETE_FOLIO', payload: m.id });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">Folio Registry</h2>
          <p className="text-muted text-sm mt-1">
            Map each AMC folio to a beneficiary and guardian — used to auto-attribute incoming SIPs.
          </p>
        </div>
        <button onClick={() => setEditing(BLANK(activeMemberId === 'all' ? data.members[0]?.id ?? '1' : activeMemberId))}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> <span className="hidden sm:inline">Add Folio</span>
        </button>
      </div>

      {mappings.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <FolderKey size={40} className="mx-auto mb-3 opacity-30" />
          <p>No folios mapped yet. Add one so SIP alerts get attributed automatically.</p>
        </div>
      ) : (
        <div className="bg-surface border border-edge rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge">
                  {['Folio', 'Scheme', 'AMC', 'Beneficiary', 'Guardian', 'SIP', ''].map(h => (
                    <th key={h} className="text-left text-faint text-xs font-medium px-4 py-3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id} className="border-b border-edge hover:bg-surface2 transition-colors">
                    <td className="px-4 py-3 font-mono text-content text-xs whitespace-nowrap">{m.folioNumber}</td>
                    <td className="px-4 py-3 text-content text-xs max-w-[240px]">
                      <p className="line-clamp-2">{m.schemeName || '—'}</p>
                      {m.schemeCode && <span className="text-faint text-xs">code {m.schemeCode}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{m.amc || '—'}</td>
                    <td className="px-4 py-3 text-accent text-xs whitespace-nowrap">{memberName(m.memberId)}</td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                      {m.guardianMemberId ? memberName(m.guardianMemberId) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {m.isSIP
                        ? <span className="bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">{m.sipAmount ? `₹${m.sipAmount.toLocaleString('en-IN')}` : 'SIP'}</span>
                        : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setEditing(m)} className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(m)} className="p-1.5 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit Folio Mapping' : 'Add Folio Mapping'} onClose={() => setEditing(null)}>
          <FolioForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(m) => {
              dispatch({ type: 'UPSERT_FOLIO', payload: { ...m, id: m.id || generateId() } });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Folio form ────────────────────────────────────────────────────────────────
function FolioForm({ initial, onSave, onCancel }: {
  initial: FolioMapping;
  onSave: (m: FolioMapping) => void;
  onCancel: () => void;
}) {
  const { data } = useApp();
  const [f, setF] = useState<FolioMapping>(initial);
  const [results, setResults] = useState<SchemeMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const set = <K extends keyof FolioMapping>(k: K, v: FolioMapping[K]) => setF(prev => ({ ...prev, [k]: v }));

  const runSearch = async () => {
    const q = f.schemeName.trim();
    if (!q) return;
    setSearching(true);
    const res = f.schemeName ? await resolveSchemeCode(f.schemeName) : null;
    const list = await searchSchemes(q.replace(/\b(direct|regular|plan|growth|idcw|dividend|option)\b/gi, ' ').trim());
    // Put the best auto-match first
    const ordered = res ? [res, ...list.filter(s => s.schemeCode !== res.schemeCode)] : list;
    setResults(ordered.slice(0, 8));
    if (res) { set('schemeCode', res.schemeCode); set('schemeName', res.schemeName); }
    setSearching(false);
  };

  const inputCls = 'w-full bg-surface2 border border-edge rounded-xl px-3 py-2 text-sm text-content placeholder:text-faint focus:outline-none focus:border-indigo-500';
  const labelCls = 'block text-xs font-medium text-muted mb-1';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Folio Number *</label>
          <input className={inputCls} value={f.folioNumber} onChange={e => set('folioNumber', e.target.value)} placeholder="27867901" />
        </div>
        <div>
          <label className={labelCls}>AMC</label>
          <input className={inputCls} value={f.amc} onChange={e => set('amc', e.target.value)} placeholder="HDFC Mutual Fund" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Scheme Name *</label>
        <div className="flex gap-2">
          <input className={inputCls} value={f.schemeName} onChange={e => set('schemeName', e.target.value)}
            placeholder="HDFC Mid Cap Fund - Direct Plan - Growth" />
          <button type="button" onClick={runSearch} disabled={searching}
            className="flex-shrink-0 flex items-center gap-1.5 bg-surface3 hover:bg-surface2 text-content px-3 rounded-xl text-sm transition-colors disabled:opacity-50">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Find code
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-2 border border-edge rounded-xl divide-y divide-edge max-h-48 overflow-y-auto">
            {results.map(r => (
              <button key={r.schemeCode} type="button"
                onClick={() => { set('schemeCode', r.schemeCode); set('schemeName', r.schemeName); setResults([]); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-surface2 transition-colors ${f.schemeCode === r.schemeCode ? 'bg-indigo-600/10' : ''}`}>
                <span className="text-content">{r.schemeName}</span>
                <span className="text-faint ml-1.5">· {r.schemeCode}</span>
              </button>
            ))}
          </div>
        )}
        {f.schemeCode && <p className="text-success text-xs mt-1">Scheme code: {f.schemeCode} (live NAV enabled)</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Beneficiary (whose tab) *</label>
          <select className={inputCls} value={f.memberId} onChange={e => set('memberId', e.target.value)}>
            {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Guardian (legal holder)</label>
          <select className={inputCls} value={f.guardianMemberId ?? ''} onChange={e => set('guardianMemberId', e.target.value || undefined)}>
            <option value="">— None —</option>
            {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 items-end">
        <label className="flex items-center gap-2 text-sm text-content">
          <input type="checkbox" checked={f.isSIP} onChange={e => set('isSIP', e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600" />
          This is a SIP
        </label>
        <div>
          <label className={labelCls}>Expected SIP amount (₹)</label>
          <input type="number" className={inputCls} value={f.sipAmount ?? ''} onChange={e => set('sipAmount', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="10000" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-muted hover:text-content transition-colors">Cancel</button>
        <button
          onClick={() => onSave(f)}
          disabled={!f.folioNumber.trim() || !f.schemeName.trim() || !f.memberId}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          Save Folio
        </button>
      </div>
    </div>
  );
}
