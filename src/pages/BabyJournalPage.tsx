import { useState, useRef, useMemo } from 'react';
import {
  Mic, Square, Save, Search, Star, Trash2, X,
  BookHeart, ChevronDown, Pencil,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { JournalEntry, JournalMood } from '../types';

// ─── Web Speech API types ─────────────────────────────────────────────────────
interface SREvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SRErrorEvent extends Event { error: string; }
type SRInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror:  ((e: SRErrorEvent) => void) | null;
  onend:    (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
function getSR(): (new () => SRInstance) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] || w['webkitSpeechRecognition'] || null) as (new () => SRInstance) | null;
}

// iOS (Safari / home-screen PWA) has these SR quirks:
//   • continuous=true is silently ignored — it stops after each utterance
//   • interimResults is unreliable
//   • sr.start() after onend needs ~300 ms delay or throws
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MOOD_META: Record<JournalMood, { emoji: string; label: string; border: string; bg: string; glow: string }> = {
  happy:     { emoji: '🥰', label: 'Happy',     border: 'border-pink-500/50',   bg: 'bg-pink-500/10',   glow: 'shadow-pink-500/20' },
  excited:   { emoji: '🤩', label: 'Excited',   border: 'border-amber-500/50',  bg: 'bg-amber-500/10',  glow: 'shadow-amber-500/20' },
  funny:     { emoji: '😄', label: 'Funny',     border: 'border-emerald-500/50',bg: 'bg-emerald-500/10',glow: 'shadow-emerald-500/20' },
  calm:      { emoji: '😌', label: 'Calm',      border: 'border-blue-500/50',   bg: 'bg-blue-500/10',   glow: 'shadow-blue-500/20' },
  sad:       { emoji: '😢', label: 'Sad',       border: 'border-edge',  bg: 'bg-slate-500/10',  glow: 'shadow-slate-500/20' },
  surprised: { emoji: '😲', label: 'Surprised', border: 'border-purple-500/50', bg: 'bg-purple-500/10', glow: 'shadow-purple-500/20' },
};

const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी'  },
  { code: 'gu-IN', label: 'ગુજરાતી' },
];

const RELATION_DOT: Record<string, string> = {
  self: 'bg-indigo-500', wife: 'bg-pink-500', kid: 'bg-amber-500',
};

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function today() { return new Date().toISOString().slice(0, 10); }

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMonthYear(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BabyJournalPage() {
  const { data, dispatch } = useApp();

  // ── Recording state ────────────────────────────────────────────────────────
  const [recState, setRecState] = useState<'idle' | 'recording' | 'review'>('idle');
  const [finalText, setFinalText]     = useState('');
  const [interimText, setInterimText] = useState('');
  const [editText, setEditText]       = useState('');
  const [mood, setMood]               = useState<JournalMood | undefined>();
  const [isMilestone, setIsMilestone] = useState(false);
  const [entryTitle, setEntryTitle]   = useState('');
  const [memberId, setMemberId]       = useState(() => data.members.find(m => m.relation === 'kid')?.id ?? data.members[0]?.id ?? '');
  const [lang, setLang]               = useState('en-IN');
  const [recSecs, setRecSecs]         = useState(0);
  const [srError, setSrError]         = useState('');
  const [editingId, setEditingId]     = useState<string | null>(null);
  // iOS: SR pauses between utterances while it processes — show a visual indicator
  const [iosProcessing, setIosProcessing] = useState(false);

  // ── Gallery state ──────────────────────────────────────────────────────────
  const [search, setSearch]         = useState('');
  const [filterMember, setFilterMember] = useState('all');

  const recRef    = useRef<SRInstance | null>(null);
  const isRecRef  = useRef(false);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalRef  = useRef('');
  // Tracks the most recent interim text so stopRecording can capture it
  // even if sr.stop() discards the last unfinalized utterance
  const interimRef = useRef('');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const memberName = (id: string) => data.members.find(m => m.id === id)?.name ?? '—';
  const memberRelation = (id: string) => data.members.find(m => m.id === id)?.relation ?? 'self';

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = () => {
    const SR = getSR();
    if (!SR) {
      setSrError('Speech recognition is not supported. On iPhone, use Safari or the home-screen shortcut.');
      return;
    }
    setSrError('');
    finalRef.current = '';
    interimRef.current = '';
    setFinalText('');
    setInterimText('');
    setIosProcessing(false);

    const ios = isIOS();
    const sr = new SR();
    // iOS silently ignores continuous=true; we handle restarts manually via onend
    sr.continuous = !ios;
    // interimResults: show live text on all platforms — works fine on iOS with our restart loop
    sr.interimResults = true;
    sr.lang = lang;

    sr.onresult = (e: SREvent) => {
      setIosProcessing(false);
      let fin = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + ' ';
        else interim += t;
      }
      if (fin) {
        finalRef.current += fin;
        interimRef.current = '';   // finalized — clear interim tracking
        setFinalText(finalRef.current);
      }
      interimRef.current = interim;
      setInterimText(interim);
    };

    sr.onerror = (e: SRErrorEvent) => {
      const err = e.error ?? '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        // Microphone permission denied
        setSrError(
          ios
            ? 'Microphone blocked. Fix it:\n1. iPhone Settings → Safari → Microphone → Allow\n2. Close this app and reopen it\n\nNo earphones needed — built-in mic works fine.'
            : 'Microphone access denied. Please allow it in your browser settings and reload.'
        );
        isRecRef.current = false;
        if (timerRef.current) clearInterval(timerRef.current);
        setIosProcessing(false);
        setRecState('idle');
      } else if (err === 'network') {
        setSrError('Network error — speech recognition needs an internet connection.');
      }
      // 'no-speech' and 'aborted' are normal on iOS; onend will restart
    };

    sr.onend = () => {
      if (!isRecRef.current) return;
      // iOS needs a pause before restarting; immediate sr.start() throws NotAllowedError
      setIosProcessing(true);
      setTimeout(() => {
        if (!isRecRef.current) { setIosProcessing(false); return; }
        try {
          sr.start();
          setIosProcessing(false);
        } catch {
          // Restart failed (permissions revoked mid-session or service unavailable)
          setIosProcessing(false);
          if (finalRef.current.trim()) {
            isRecRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
            setInterimText('');
            setEditText(finalRef.current.trim());
            setRecState('review');
          }
        }
      }, ios ? 300 : 0);
    };

    sr.start();
    recRef.current = sr;
    isRecRef.current = true;
    setRecState('recording');
    setRecSecs(0);
    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
  };

  const stopRecording = () => {
    isRecRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    // Merge finalized text + any interim that sr.stop() discarded mid-utterance
    const combined = [finalRef.current.trim(), interimRef.current.trim()]
      .filter(Boolean).join(' ');
    interimRef.current = '';
    setInterimText('');
    setIosProcessing(false);
    setEditText(combined);
    setRecState('review');
  };

  const discardRecording = () => {
    isRecRef.current = false;
    recRef.current?.abort();
    recRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    finalRef.current = ''; interimRef.current = '';
    setFinalText(''); setInterimText(''); setEditText('');
    setMood(undefined); setIsMilestone(false); setEntryTitle('');
    setIosProcessing(false);
    setRecState('idle');
  };

  const saveEntry = () => {
    const text = editText.trim();
    if (!text || !memberId) return;
    const entry: JournalEntry = {
      id: editingId ?? uid(),
      memberId,
      text,
      title: entryTitle.trim() || undefined,
      date: today(),
      createdAt: new Date().toISOString(),
      mood,
      isMilestone,
    };
    dispatch({ type: editingId ? 'UPDATE_JOURNAL' : 'ADD_JOURNAL', payload: entry });
    setEditText(''); setMood(undefined); setIsMilestone(false); setEntryTitle('');
    setRecState('idle'); setEditingId(null);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
    setEntryTitle(entry.title ?? '');
    setMood(entry.mood);
    setIsMilestone(entry.isMilestone);
    setMemberId(entry.memberId);
    setRecState('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteEntry = (id: string) => {
    if (window.confirm('Delete this memory?')) {
      dispatch({ type: 'DELETE_JOURNAL', payload: id });
    }
  };

  const recLabel = `${String(Math.floor(recSecs / 60)).padStart(2, '0')}:${String(recSecs % 60).padStart(2, '0')}`;

  // ── Filtered & grouped memories ────────────────────────────────────────────
  const filtered = useMemo(() => {
    return [...(data.journal ?? [])]
      .filter(j => filterMember === 'all' || j.memberId === filterMember)
      .filter(j => !search || j.text.toLowerCase().includes(search.toLowerCase()) || (j.title ?? '').toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.journal, filterMember, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const j of filtered) {
      const k = formatMonthYear(j.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(j);
    }
    return map;
  }, [filtered]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const inputCls = 'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-pink-500/30 to-purple-500/30 rounded-2xl border border-pink-500/20">
          <BookHeart size={24} className="text-pink-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-content">Baby Journal</h2>
          <p className="text-muted text-sm mt-0.5">Capture every precious moment 💕</p>
        </div>
        <span className="ml-auto text-faint text-sm">{data.journal?.length ?? 0} memories</span>
      </div>

      {/* ── Record / Review section ────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-edge rounded-3xl p-6 space-y-5 shadow-xl">

        {recState === 'idle' && (
          <>
            <h3 className="text-content font-semibold text-base flex items-center gap-2">
              <Mic size={16} className="text-pink-400" /> Add a New Memory
            </h3>

            {/* Member + Language row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted text-xs mb-1.5 font-medium">Memory is about</label>
                <div className="relative">
                  <select value={memberId} onChange={e => setMemberId(e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                    {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-muted text-xs mb-1.5 font-medium">Speak in</label>
                <div className="relative">
                  <select value={lang} onChange={e => setLang(e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                </div>
              </div>
            </div>

            {srError && (
              <div className="text-danger text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 whitespace-pre-line">{srError}</div>
            )}

            {/* Big record button */}
            <div className="flex flex-col items-center gap-3 py-4">
              <button
                onClick={startRecording}
                className="relative w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 flex items-center justify-center shadow-2xl shadow-pink-500/40 transition-all hover:scale-105 active:scale-95"
              >
                <Mic size={36} className="text-content" />
              </button>
              <p className="text-muted text-sm">Tap to start recording</p>
              <p className="text-faint text-xs">or type directly below</p>
            </div>

            {/* Manual text entry */}
            <div>
              <label className="block text-muted text-xs mb-1.5 font-medium">Or type your memory</label>
              <textarea
                rows={3}
                placeholder="Write about this moment…"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className={inputCls + ' resize-none'}
              />
              {editText.trim() && (
                <button
                  onClick={() => setRecState('review')}
                  className="mt-2 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  <Pencil size={14} /> Review & Save
                </button>
              )}
            </div>
          </>
        )}

        {recState === 'recording' && (
          <div className="flex flex-col items-center gap-6 py-2">
            {/* Animated recording indicator */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-36 h-36 rounded-full bg-red-500/10 animate-ping" />
              <div className="absolute w-28 h-28 rounded-full bg-red-500/15 animate-pulse" />
              <button
                onClick={stopRecording}
                className="relative w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-2xl shadow-red-500/40 hover:scale-105 active:scale-95 transition-all"
              >
                <Square size={28} className="text-content" fill="white" />
              </button>
            </div>

            <div className="text-center space-y-1">
              <p className="text-content font-mono text-2xl font-bold">{recLabel}</p>
              <p className="text-danger text-sm flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording…
              </p>
            </div>

            {/* iOS processing badge */}
            {iosProcessing && (
              <div className="flex items-center gap-2 text-warn text-xs bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 w-fit mx-auto">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Processing… keep holding phone near your mouth
              </div>
            )}

            {/* Live transcript */}
            <div className="w-full bg-surface border border-edge rounded-2xl shadow-card px-4 py-3 min-h-20 max-h-40 overflow-y-auto">
              <p className="text-content text-sm leading-relaxed">
                {finalText}
                <span className="text-faint">{interimText}</span>
              </p>
              {!finalText && !interimText && (
                <p className="text-faint text-sm italic">
                  {iosProcessing ? 'Restarting listener…' : 'Listening… speak now'}
                </p>
              )}
            </div>

            <button onClick={discardRecording} className="flex items-center gap-1.5 text-faint hover:text-muted text-sm transition-colors">
              <X size={14} /> Discard
            </button>
          </div>
        )}

        {recState === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-content font-semibold flex items-center gap-2">
                <Pencil size={15} className="text-accent" />
                {editingId ? 'Edit Memory' : 'Review & Save'}
              </h3>
              <button onClick={discardRecording} className="p-1.5 text-faint hover:text-muted hover:bg-surface rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Optional title */}
            <div>
              <label className="block text-muted text-xs mb-1.5 font-medium">Title (optional)</label>
              <input type="text" placeholder="e.g. First steps! 🎉" value={entryTitle} onChange={e => setEntryTitle(e.target.value)} className={inputCls} />
            </div>

            {/* Editable transcript */}
            <div>
              <label className="block text-muted text-xs mb-1.5 font-medium">Memory *</label>
              <textarea
                rows={5}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className={inputCls + ' resize-none'}
                placeholder="Describe this moment…"
              />
            </div>

            {/* Member */}
            <div>
              <label className="block text-muted text-xs mb-1.5 font-medium">About</label>
              <div className="relative">
                <select value={memberId} onChange={e => setMemberId(e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                  {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              </div>
            </div>

            {/* Mood selector */}
            <div>
              <label className="block text-muted text-xs mb-2 font-medium">Mood</label>
              <div className="flex gap-2 flex-wrap">
                {(Object.entries(MOOD_META) as [JournalMood, typeof MOOD_META[JournalMood]][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setMood(mood === k ? undefined : k)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all ${
                      mood === k
                        ? `${v.bg} ${v.border} text-white scale-105`
                        : 'bg-surface border-edge text-muted hover:text-content'
                    }`}
                  >
                    <span className="text-base">{v.emoji}</span> {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Milestone toggle */}
            <button
              onClick={() => setIsMilestone(!isMilestone)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                isMilestone
                  ? 'bg-amber-500/20 border-amber-500/50 text-warn'
                  : 'bg-surface border-edge text-muted hover:text-content'
              }`}
            >
              <Star size={15} className={isMilestone ? 'fill-amber-400 text-warn' : ''} />
              {isMilestone ? 'Milestone memory ✨' : 'Mark as milestone'}
            </button>

            {/* Save */}
            <button
              onClick={saveEntry}
              disabled={!editText.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 text-content py-3 rounded-xl font-semibold transition-all shadow-lg shadow-pink-500/20"
            >
              <Save size={16} /> {editingId ? 'Update Memory' : 'Save Memory 💕'}
            </button>
          </div>
        )}
      </div>

      {/* ── Memories gallery ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-content font-bold text-lg flex items-center gap-2">
            📚 Our Memories
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Member filter */}
            <div className="relative">
              <select
                value={filterMember}
                onChange={e => setFilterMember(e.target.value)}
                className="bg-surface border border-edge rounded-xl px-3 py-2 text-muted text-sm outline-none focus:border-indigo-500 appearance-none pr-7"
              >
                <option value="all">All family</option>
                {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="text"
                placeholder="Search memories…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-surface border border-edge rounded-xl pl-8 pr-3 py-2 text-muted text-sm outline-none focus:border-indigo-500 w-44"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📖</div>
            <p className="text-muted text-lg font-medium">No memories yet</p>
            <p className="text-faint text-sm mt-1">Start recording your baby's precious moments above</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(grouped.entries()).map(([month, entries]) => (
              <div key={month}>
                {/* Month header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-muted text-xs font-bold uppercase tracking-widest">{month}</span>
                  <div className="flex-1 h-px bg-surface" />
                  <span className="text-faint text-xs">{entries.length} {entries.length === 1 ? 'memory' : 'memories'}</span>
                </div>

                {/* Memory cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {entries.map(entry => {
                    const moodMeta = entry.mood ? MOOD_META[entry.mood] : null;
                    const rel      = memberRelation(entry.memberId);
                    return (
                      <div
                        key={entry.id}
                        className={`relative rounded-2xl border p-4 space-y-3 shadow-lg transition-transform hover:-translate-y-0.5 ${
                          moodMeta
                            ? `${moodMeta.bg} ${moodMeta.border} ${moodMeta.glow}`
                            : 'bg-surface border-edge'
                        }`}
                      >
                        {/* Milestone star */}
                        {entry.isMilestone && (
                          <div className="absolute top-3 right-3">
                            <span className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 rounded-full px-2 py-0.5 text-xs text-warn font-semibold">
                              <Star size={10} className="fill-amber-400 text-warn" /> Milestone
                            </span>
                          </div>
                        )}

                        {/* Mood + title */}
                        <div className="flex items-start gap-2 pr-16">
                          {moodMeta && <span className="text-2xl flex-shrink-0">{moodMeta.emoji}</span>}
                          {entry.title && (
                            <p className="text-content font-semibold text-sm leading-snug">{entry.title}</p>
                          )}
                        </div>

                        {/* Text */}
                        <p className="text-muted text-sm leading-relaxed line-clamp-4">{entry.text}</p>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-edge">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RELATION_DOT[rel] ?? 'bg-slate-500'}`} />
                            <span className="text-muted text-xs">{memberName(entry.memberId)}</span>
                            <span className="text-faint text-xs">·</span>
                            <span className="text-faint text-xs">{formatDisplayDate(entry.date)}</span>
                            <span className="text-faint text-xs hidden sm:inline">· {formatTime(entry.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(entry)}
                              className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="p-1.5 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
