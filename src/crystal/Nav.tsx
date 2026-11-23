// Gezinme: masaüstü sol sayfa, mobil kristal dok, "Defter" içindekiler sayfası ve "Yeni" oluşturma sayfası.
// Dok sabitlemeleri ve son açılanlar cihazda tutulur (su:dock, su:recent). Dokta yukarı kaydırma içindekileri açar.
import { HomeIcon } from './look';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, CalendarDays, CalendarHeart, CalendarPlus, CheckSquare, Files, FolderHeart, Gem, Home, Images, Landmark, Lightbulb, ListPlus,
  LogOut, Megaphone, Pin, Plus, Search, Settings, Sparkles, Users, X, type LucideIcon, BellRing, NotebookPen,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPref, setPref } from '../lib/prefs';
import { todayKey } from '../lib/dates';
import { useEditors } from '../components/Editors';
import { useToast } from '../components/ui';

export type NavItem = { to: string; match: string; label: string; short: string; Icon: LucideIcon; hint: string };
export const NAV: NavItem[] = [
  { to: '/', match: '/', label: 'Ana Sayfa', short: 'Bugün', Icon: Home, hint: 'Günün özeti' },
  { to: '/takvim/ay', match: '/takvim', label: 'Takvim', short: 'Takvim', Icon: CalendarDays, hint: 'Yıl · ay · hafta · ajanda' },
  { to: '/gun', match: '/gun', label: 'Günlük Plan', short: 'Gün', Icon: CalendarHeart, hint: 'Saat saat plan, günlük' },
  { to: '/gorevler', match: '/gorevler', label: 'Görevler', short: 'Görevler', Icon: CheckSquare, hint: 'Tüm yapılacaklar' },
  { to: '/projeler', match: '/projeler', label: 'Projelerim', short: 'Projeler', Icon: FolderHeart, hint: 'Sergiler, koleksiyonlar' },
  { to: '/galeri', match: '/galeri', label: 'Galeri', short: 'Galeri', Icon: Images, hint: 'Ortak galeri, NFT eserleri' },
  { to: '/koleksiyonlar', match: '/koleksiyonlar', label: 'Koleksiyonlarım', short: 'Koleksiyon', Icon: Gem, hint: '530 eser' },
  { to: '/fikirler', match: '/fikirler', label: 'Fikirler ve Notlar', short: 'Notlar', Icon: Lightbulb, hint: 'Aklımdakiler' },
  { to: '/firsatlar', match: '/firsatlar', label: 'Sergiler ve Fırsatlar', short: 'Fırsatlar', Icon: Landmark, hint: 'Başvurular, tarihler' },
  { to: '/sosyal', match: '/sosyal', label: 'Sosyal Medya', short: 'Sosyal', Icon: Megaphone, hint: 'Paylaşım planı' },
  { to: '/kisiler', match: '/kisiler', label: 'Kişiler', short: 'Kişiler', Icon: Users, hint: 'Galeriler, küratörler' },
  { to: '/dosyalar', match: '/dosyalar', label: 'Dosyalar', short: 'Dosyalar', Icon: Files, hint: 'Belgeler, görseller' },
  { to: '/ayarlar', match: '/ayarlar', label: 'Ayarlar', short: 'Ayarlar', Icon: Settings, hint: 'Tercihler, bildirimler' },
];
export const isActive = (pathname: string, n: NavItem) => (n.match === '/' ? pathname === '/' : pathname === n.match || pathname.startsWith(n.match + '/'));
export const openSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

const DEFAULT_PINS = ['/', '/takvim', '/gorevler'];
function readPins(): string[] { try { const v = JSON.parse(getPref('dock', '[]')); return Array.isArray(v) && v.length === 3 ? v : DEFAULT_PINS; } catch { return DEFAULT_PINS; } }
function readRecent(): string[] { try { const v = JSON.parse(getPref('recent', '[]')); return Array.isArray(v) ? v : []; } catch { return []; } }

/** Son açılan bölümleri kaydeder (içindekiler sayfasının en üstünde görünür). */
export function useRecent() {
  const loc = useLocation();
  useEffect(() => {
    const n = NAV.find((x) => isActive(loc.pathname, x));
    if (!n) return;
    const r = [n.match, ...readRecent().filter((m) => m !== n.match)].slice(0, 5);
    setPref('recent', JSON.stringify(r));
  }, [loc.pathname]);
}

/** Alttan açılan kristal sayfa (mobil) / ortada pencere (masaüstü). */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  // aşağı kaydırarak kapat
  const y0 = useRef<number | null>(null);
  return (
    <div className="cr-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cr-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}
        onTouchStart={(e) => { y0.current = (ref.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null; }}
        onTouchEnd={(e) => { if (y0.current != null && e.changedTouches[0].clientY - y0.current > 90) onClose(); y0.current = null; }}>
        <span className="cr-grab" aria-hidden="true" />
        <div className="cr-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-glass icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "Yeni": görev, etkinlik, hatırlatma, paylaşım, fikir (hemen yazılır), günlük not. */
export function CreateSheet({ onClose }: { onClose: () => void }) {
  const { openTask, openEvent, openPost } = useEditors();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [idea, setIdea] = useState('');
  const today = todayKey();
  const run = (f: () => void) => { onClose(); setTimeout(f, 30); };
  async function saveIdea() {
    const v = idea.trim(); if (!v) return;
    const [first, ...rest] = v.split('\n');
    const { error } = await supabase.from('ideas').insert({ title: first.slice(0, 200), body: rest.join('\n').trim() || null, category: 'art' });
    if (error) return toast.fail(error);
    setIdea(''); qc.invalidateQueries({ queryKey: ['ideas'] }); toast.ok('Fikir deftere yazıldı ✦'); onClose();
  }
  const acts: [string, string, LucideIcon, () => void][] = [
    ['Görev', 'Bugüne', ListPlus, () => openTask({ due_date: today })],
    ['Etkinlik', 'Takvime', CalendarPlus, () => openEvent({})],
    ['Hatırlatma', 'Tekrarlayan', BellRing, () => openTask({ due_date: today, rrule: 'FREQ=DAILY' })],
    ['Paylaşım', 'Sosyal medya', Megaphone, () => openPost({})],
    ['Günlük not', 'Bugünün sayfası', NotebookPen, () => nav(`/gun/${today}`)],
    ['Ara', 'Her şeyde', Search, openSearch],
  ];
  return (
    <Sheet title="Deftere ekle" onClose={onClose}>
      <div className="cr-acts">
        {acts.map(([l, h, I, f]) => (
          <button key={l} type="button" className="cr-act" onClick={() => run(f)}><span className="cr-gem"><I size={22} strokeWidth={1.7} /></span><b>{l}</b><small>{h}</small></button>
        ))}
      </div>
      <div className="cr-quick">
        <label htmlFor="cr-idea" className="cr-quick-l"><Sparkles size={15} /> Hızlı fikir</label>
        <textarea id="cr-idea" className="textarea" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveIdea(); }} placeholder="Aklına geleni yaz… (ilk satır başlık olur)" />
        <button type="button" className="btn btn-primary btn-sm" onClick={saveIdea} disabled={!idea.trim()}><Plus size={14} />Fikri kaydet</button>
      </div>
    </Sheet>
  );
}

/** "Defter": tüm bölümler, arama, son açılanlar, doka sabitleme, çıkış. */
export function IndexSheet({ onClose, pins, setPins }: { onClose: () => void; pins: string[]; setPins: (p: string[]) => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const recent = readRecent().map((m) => NAV.find((n) => n.match === m)).filter(Boolean).filter((n) => !isActive(loc.pathname, n!)).slice(0, 4) as NavItem[];
  function togglePin(m: string) {
    if (pins.includes(m)) { if (pins.length > 1) setPins(pins.filter((x) => x !== m)); return; }
    setPins([...pins, m].slice(-3));
  }
  return (
    <Sheet title="İçindekiler" onClose={onClose}>
      <button type="button" className="cr-search" onClick={() => { onClose(); setTimeout(openSearch, 30); }}><Search size={18} /><span>Görev, proje, eser, kişi ara…</span><kbd className="kbd">⌘K</kbd></button>
      {recent.length > 0 && (
        <div className="cr-recent">
          <span className="cr-cap">Son açılanlar</span>
          <div className="cr-recent-row">{recent.map((n) => <Link key={n.match} to={n.to} onClick={onClose} className="chip"><n.Icon size={13} />{n.short}</Link>)}</div>
        </div>
      )}
      <div className="cr-index">
        {NAV.map((n) => {
          const on = isActive(loc.pathname, n);
          const pinned = pins.includes(n.match);
          return (
            <div key={n.match} className={`cr-ix${on ? ' on' : ''}`}>
              <Link to={n.to} onClick={onClose} className="cr-ix-main">
                <span className="cr-gem sm"><n.Icon size={19} strokeWidth={1.7} /></span>
                <span className="cr-ix-t"><b>{n.label}</b><small>{n.hint}</small></span>
              </Link>
              <button type="button" className={`cr-pin${pinned ? ' on' : ''}`} aria-pressed={pinned} aria-label={pinned ? `${n.label} doktan kaldır` : `${n.label} doka sabitle`} title={pinned ? 'Doktan kaldır' : 'Alt çubuğa sabitle'} onClick={() => togglePin(n.match)}>
                <Pin size={15} fill={pinned ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="small muted cr-tip">İğne ile en sık kullandığın üç bölümü alt çubuğa sabitle. Alt çubukta yukarı kaydırınca bu sayfa açılır.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().then(() => nav('/'))}><LogOut size={14} />Çıkış yap</button>
    </Sheet>
  );
}

/** Mobil kristal dok: 3 sabit bölüm + ortada "Yeni" mücevheri + "Defter". */
export function Dock() {
  const loc = useLocation();
  const [pins, setPinsS] = useState(readPins);
  const [sheet, setSheet] = useState<'' | 'new' | 'index'>('');
  const setPins = (p: string[]) => { setPinsS(p); setPref('dock', JSON.stringify(p.length === 3 ? p : [...p, ...DEFAULT_PINS.filter((d) => !p.includes(d))].slice(0, 3))); };
  useEffect(() => { setSheet(''); }, [loc.pathname]);
  useEffect(() => {
    const open = (e: Event) => setSheet((e as CustomEvent<'new' | 'index'>).detail);
    document.addEventListener('cr-sheet', open);
    return () => document.removeEventListener('cr-sheet', open);
  }, []);
  const items = (pins.length === 3 ? pins : DEFAULT_PINS).map((m) => NAV.find((n) => n.match === m)!).filter(Boolean);
  const y0 = useRef<number | null>(null);
  const cell = (n: NavItem) => (
    <Link key={n.match} to={n.to} className={isActive(loc.pathname, n) ? 'active' : ''} aria-current={isActive(loc.pathname, n) ? 'page' : undefined}>
      <span className="ic">{n.match === '/' ? <HomeIcon size={30} fallback={<n.Icon size={22} strokeWidth={1.75} />} /> : <n.Icon size={22} strokeWidth={1.75} />}</span><span className="tx">{n.short}</span>
    </Link>
  );
  const inIndex = !items.some((n) => isActive(loc.pathname, n)) && NAV.some((n) => isActive(loc.pathname, n));
  return (
    <>
      <nav className="cr-dock" aria-label="Alt menü"
        onTouchStart={(e) => { y0.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (y0.current != null && y0.current - e.changedTouches[0].clientY > 40) setSheet('index'); y0.current = null; }}>
        {cell(items[0])}{cell(items[1])}
        <button type="button" className="cr-new" onClick={() => setSheet('new')} aria-label="Deftere ekle"><span className="cr-new-gem"><Plus size={26} strokeWidth={2.2} /></span></button>
        {cell(items[2])}
        <button type="button" className={inIndex ? 'active' : ''} onClick={() => setSheet('index')} aria-label="İçindekiler: tüm bölümler">
          <span className="ic"><BookOpen size={22} strokeWidth={1.75} /></span><span className="tx">Defter</span>
        </button>
      </nav>
      {sheet === 'new' && <CreateSheet onClose={() => setSheet('')} />}
      {sheet === 'index' && <IndexSheet onClose={() => setSheet('')} pins={pins} setPins={setPins} />}
    </>
  );
}
