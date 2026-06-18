import React, { useState } from 'react';
import { Users, Edit2, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { MemberRelation } from '../../types';

const RELATION_DOT: Record<MemberRelation, string> = {
  self: 'bg-indigo-500',
  wife: 'bg-pink-500',
  kid: 'bg-amber-500',
};

const RELATION_LABELS: Record<MemberRelation, string> = {
  self: 'Self',
  wife: 'Wife',
  kid: 'Kid',
};

export const ALL_MEMBERS_ID = 'all';

export default function Header() {
  const { data, dispatch, activeMemberId, setActiveMemberId } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const saveEdit = (id: string) => {
    const member = data.members.find(m => m.id === id);
    if (member && editName.trim()) {
      dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, name: editName.trim() } });
    }
    setEditingId(null);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <Users size={15} className="text-slate-500" />
          <span className="text-slate-500 text-sm font-medium">Viewing as:</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* All Family pill */}
          <button
            onClick={() => setActiveMemberId(ALL_MEMBERS_ID)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
              activeMemberId === ALL_MEMBERS_ID
                ? 'bg-gradient-to-r from-indigo-600/30 to-pink-600/20 text-white border-indigo-500/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800 border-transparent'
            }`}
          >
            <div className="flex -space-x-0.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 ring-1 ring-slate-900" />
              <span className="w-2 h-2 rounded-full bg-pink-500 ring-1 ring-slate-900" />
              <span className="w-2 h-2 rounded-full bg-amber-500 ring-1 ring-slate-900" />
            </div>
            All Family
          </button>

          <span className="w-px h-5 bg-slate-700 mx-1" />

          {/* Individual members */}
          {data.members.map(member => (
            <div key={member.id} className="flex items-center gap-0.5">
              {editingId === member.id ? (
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-600 rounded-xl px-2 py-1">
                  <input
                    className="bg-transparent text-white text-sm w-20 outline-none"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(member.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                  <button onClick={() => saveEdit(member.id)} className="text-emerald-400 hover:text-emerald-300">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setActiveMemberId(member.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                      activeMemberId === member.id
                        ? 'bg-indigo-600/20 text-white border-indigo-500/40'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800 border-transparent'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${RELATION_DOT[member.relation]}`} />
                    {member.name}
                    <span className="text-xs text-slate-500">({RELATION_LABELS[member.relation]})</span>
                  </button>
                  <button
                    onClick={() => startEdit(member.id, member.name)}
                    className="p-1 text-slate-700 hover:text-slate-400 transition-colors"
                    title="Rename"
                  >
                    <Edit2 size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
