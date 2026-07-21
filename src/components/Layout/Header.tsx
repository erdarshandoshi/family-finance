import { useState } from 'react';
import { Users, Edit2, Check, X, LogOut, Menu, IndianRupee, Sun, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { MemberRelation } from '../../types';

const RELATION_DOT: Record<MemberRelation, string> = {
  self: 'bg-indigo-300',
  wife: 'bg-pink-300',
  kid:  'bg-amber-300',
};

const RELATION_LABELS: Record<MemberRelation, string> = {
  self: 'Self',
  wife: 'Wife',
  kid:  'Kid',
};

export const ALL_MEMBERS_ID = 'all';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { data, dispatch, activeMemberId, setActiveMemberId } = useApp();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editName,  setEditName]    = useState('');

  const startEdit = (id: string, name: string) => { setEditingId(id); setEditName(name); };
  const saveEdit  = (id: string) => {
    const member = data.members.find(m => m.id === id);
    if (member && editName.trim()) {
      dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, name: editName.trim() } });
    }
    setEditingId(null);
  };

  const MemberPills = () => (
    <div className="flex items-center gap-1.5 flex-nowrap">
      {/* All Family */}
      <button
        onClick={() => setActiveMemberId(ALL_MEMBERS_ID)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border whitespace-nowrap ${
          activeMemberId === ALL_MEMBERS_ID
            ? 'bg-white/20 text-white border-white/40'
            : 'text-white/75 hover:text-white hover:bg-white/10 border-transparent'
        }`}
      >
        <div className="flex -space-x-0.5">
          <span className="w-2 h-2 rounded-full bg-indigo-300 ring-1 ring-white/50" />
          <span className="w-2 h-2 rounded-full bg-pink-300  ring-1 ring-white/50" />
          <span className="w-2 h-2 rounded-full bg-amber-300 ring-1 ring-white/50" />
        </div>
        All
      </button>

      <span className="w-px h-5 bg-white/25 flex-shrink-0" />

      {/* Individual members */}
      {data.members.map(member => (
        <div key={member.id} className="flex items-center gap-0.5 flex-shrink-0">
          {editingId === member.id ? (
            <div className="flex items-center gap-1 bg-white/15 border border-white/30 rounded-xl px-2 py-1">
              <input
                className="bg-transparent text-white placeholder-white/50 text-sm w-20 outline-none"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(member.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <button onClick={() => saveEdit(member.id)} className="text-white hover:text-white/80"><Check size={13} /></button>
              <button onClick={() => setEditingId(null)}  className="text-white/60 hover:text-white"><X size={13} /></button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setActiveMemberId(member.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border whitespace-nowrap ${
                  activeMemberId === member.id
                    ? 'bg-white/20 text-white border-white/40'
                    : 'text-white/75 hover:text-white hover:bg-white/10 border-transparent'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/40 ${RELATION_DOT[member.relation]}`} />
                {member.name}
                <span className="text-xs text-white/60 hidden sm:inline">({RELATION_LABELS[member.relation]})</span>
              </button>
              <button
                onClick={() => startEdit(member.id, member.name)}
                className="p-1 text-white/50 hover:text-white transition-colors"
              >
                <Edit2 size={11} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md flex-shrink-0 text-white">
      {/* ── Main row ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Logo — mobile only */}
        <div className="lg:hidden flex items-center gap-2 min-w-0">
          <div className="bg-white p-1.5 rounded-lg flex-shrink-0 shadow-sm">
            <IndianRupee size={14} className="text-indigo-600" />
          </div>
          <span className="text-white font-bold text-sm truncate">Family Finance</span>
        </div>

        {/* Desktop: member switcher inline */}
        <div className="hidden lg:flex items-center gap-2 mr-auto">
          <Users size={15} className="text-white/70 flex-shrink-0" />
          <span className="text-white/70 text-sm font-medium whitespace-nowrap">Viewing as:</span>
          <MemberPills />
        </div>

        {/* User avatar + logout — always visible */}
        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
            className="p-1.5 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <span className="hidden lg:block w-px h-5 bg-white/25" />
          {user?.picture && (
            <img
              src={user.picture}
              alt={user.name}
              className="w-7 h-7 rounded-full border border-white/40 flex-shrink-0"
              title={`${user.name} (${user.email})`}
            />
          )}
          <span className="text-white/80 text-xs hidden xl:block max-w-32 truncate" title={user?.email}>
            {user?.name}
          </span>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* ── Mobile member switcher row ───────────────────────────────────────── */}
      <div className="lg:hidden border-t border-white/15 px-4 py-2 overflow-x-auto scrollbar-hide">
        <MemberPills />
      </div>
    </header>
  );
}
