import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { CheckSquare, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Expand, FilePlus2, Lightbulb, Maximize, Share2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useProjects } from '../lib/data';
import { artKey, copyImage, projectSlug, saveOriginal, shareOriginal, useArtworkPages, type Nft } from '../lib/nft';
import { supabase } from '../lib/supabase';
import { useEditors } from './Editors';
import { useToast } from './ui';

export const nftKey = (n: Nft) => `${n.contract}-${n.tokenId}`;

export function useCopy() {
  const toast = useToast();
  return async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast.ok(`${what} kopyalandı`);
  };
}

export function LinkRow({ label, url, compact }: { label: string; url: string; compact?: boolean }) {
  const copy = useCopy();
  return (
    <div className="lrow" onClick={(e) => e.stopPropagation()}>
      <a className={`btn btn-glass btn-sm${compact ? ' lr-a' : ''}`} href={url} target="_blank" rel="noreferrer" title={`${label}'de aç`}>{label === 'OpenSea' ? 'OS' : 'SR'}<ExternalLink size={12} /></a>
      <button type="button" className="btn btn-copy btn-sm icon-only" aria-label={`${label} linkini kopyala`} title={`${label} linkini kopyala`} onClick={() => copy(url, `${label} linki`)}><Copy size={14} /></button>
    </div>
  );
}

export function Card({ n, onOpen }: { n: Nft; onOpen: () => void }) {
  return (
    <article className="nft-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="nft-img">{n.thumb && <img src={n.thumb} alt={n.name} loading="lazy" />}<span className="nft-zoom"><Expand size={15} /></span></div>
      <b>{n.name}</b>
      <div className="stack-links">
        <LinkRow label="OpenSea" url={n.opensea} compact />
        {n.superrare && <LinkRow label="SuperRare" url={n.superrare} compact />}
      </div>
    </article>
  );
}

/** Eserle çalışma paneli: sayfalar, hızlı fikir, görev, kaydet/paylaş. */
function Workbench({ n }: { n: Nft }) {
  const projects = useProjects();
  const project = projects.data?.find((p) => p.slug === projectSlug(n.c));
  const pages = useArtworkPages(artKey(n));
  const { openTask } = useEditors();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState('');
  async function newPage() {
    if (!project) return toast.fail(new Error('Koleksiyon projesi hazırlanıyor, birkaç saniye sonra dene'));
    setBusy('page');
    const { data, error } = await supabase.from('pages').insert({ project_id: project.id, title: `${n.name} · sayfa`, icon: '🖼️', artwork_key: artKey(n), position: pages.length + 1 }).select().single();
    if (error) { setBusy(''); return toast.fail(error); }
    await supabase.from('page_blocks').insert([
      { page_id: data.id, type: 'link', content: { url: n.opensea, title: `${n.name} · OpenSea` }, position: 1 },
      ...(n.superrare ? [{ page_id: data.id, type: 'link', content: { url: n.superrare, title: `${n.name} · SuperRare` }, position: 2 }] : []),
      { page_id: data.id, type: 'h2', content: { text: 'Fikirlerim' }, position: 3 },
      { page_id: data.id, type: 'text', content: { text: '' }, position: 4 },
    ]);
    qc.invalidateQueries({ queryKey: ['pages'] });
    nav(`/koleksiyonlar/${n.c}?sekme=sayfalar&sayfa=${data.id}`);
  }
  async function saveIdea() {
    const v = idea.trim(); if (!v) return;
    const { error } = await supabase.from('ideas').insert({ title: `${n.name}: ${v.split('\n')[0].slice(0, 160)}`, body: `${v}\n\nEser: ${n.opensea}`, category: 'art', project_id: project?.id ?? null });
    if (error) return toast.fail(error);
    setIdea(''); qc.invalidateQueries({ queryKey: ['ideas'] }); toast.ok('Fikir kaydedildi ✦');
  }
  return (
    <div className="wb">
      <b className="small">Bu eserle çalış</b>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'page'} onClick={newPage}><FilePlus2 size={13} />Yeni sayfa</button>
        <button type="button" className="btn btn-glass btn-sm" onClick={() => openTask({ title: `${n.name}: `, project_id: project?.id ?? null, due_date: null })}><CheckSquare size={13} />Görev ekle</button>
        {project && <Link className="btn btn-glass btn-sm" to={`/projeler/${project.slug}`}>Proje</Link>}
      </div>
      {pages.length > 0 && <div className="row" style={{ gap: 6 }}>{pages.map((pg) => <Link key={pg.id} className="chip chip-on-soft" to={`/koleksiyonlar/${n.c}?sekme=sayfalar&sayfa=${pg.id}`}>{pg.icon ?? '📄'} {pg.title}</Link>)}</div>}
      <textarea className="textarea" style={{ minHeight: 60 }} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Bu eser için aklına gelen fikir… (⌘+Enter kaydeder)" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveIdea(); }} />
      <button type="button" className="btn btn-glass btn-sm" style={{ justifySelf: 'start' }} onClick={saveIdea}><Lightbulb size={13} />Fikir olarak kaydet</button>
    </div>
  );
}

/** Profesyonel yakınlaştırma: iki parmakla sıkıştır, çift dokun/tıkla, tekerlek (imleç noktasına), sürükle-kaydır, sınırlar içinde kalır.
 *  1× iken yatay kaydırma önceki/sonraki esere geçer. */
function ZoomStage({ children, onSwipe, resetKey }: { children: React.ReactNode; onSwipe: (d: number) => void; resetKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [v, setV] = useState({ s: 1, x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  const st = useRef({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ d0: number; s0: number; cx: number; cy: number; x0: number; y0: number; sx: number; sy: number; moved: boolean; t: number } | null>(null);
  const lastTap = useRef(0);
  const clampV = (s: number, x: number, y: number) => {
    const r = el.current!.getBoundingClientRect();
    const mx = (r.width * (s - 1)) / 2, my = (r.height * (s - 1)) / 2;
    return { s, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };
  const set = (n: { s: number; x: number; y: number }, smooth = false) => { st.current = n; setAnim(smooth); setV(n); };
  /** (px,py) ekran noktası sabit kalacak şekilde ölçek s'ye */
  const zoomAt = (s: number, px: number, py: number, smooth = false) => {
    const r = el.current!.getBoundingClientRect();
    const c = st.current, ns = Math.min(6, Math.max(1, s));
    const ox = px - (r.left + r.width / 2), oy = py - (r.top + r.height / 2);
    const k = ns / c.s;
    set(clampV(ns, ox - (ox - c.x) * k, oy - (oy - c.y) * k), smooth);
  };
  useEffect(() => { set({ s: 1, x: 0, y: 0 }); }, [resetKey]);
  useEffect(() => {
    const node = el.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(st.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0025)), e.clientX, e.clientY); };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  const down = (e: React.PointerEvent) => {
    el.current!.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const c = st.current;
    if (p.length === 2) {
      g.current = { d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s0: c.s, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, x0: c.x, y0: c.y, sx: 0, sy: 0, moved: true, t: Date.now() };
    } else if (p.length === 1) {
      g.current = { d0: 0, s0: c.s, cx: 0, cy: 0, x0: c.x, y0: c.y, sx: e.clientX, sy: e.clientY, moved: false, t: Date.now() };
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()], G = g.current;
    if (p.length >= 2 && G.d0) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
      const r = el.current!.getBoundingClientRect();
      const ns = Math.min(6, Math.max(0.85, G.s0 * (d / G.d0)));
      const ox = G.cx - (r.left + r.width / 2), oy = G.cy - (r.top + r.height / 2);
      const k = ns / G.s0;
      const x = ox - (ox - G.x0) * k + (cx - G.cx), y = oy - (oy - G.y0) * k + (cy - G.cy);
      set(ns < 1 ? { s: ns, x: 0, y: 0 } : clampV(ns, x, y));
    } else if (p.length === 1) {
      const dx = e.clientX - G.sx, dy = e.clientY - G.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) G.moved = true;
      if (st.current.s > 1.01) set(clampV(st.current.s, G.x0 + dx, G.y0 + dy));
      else set({ s: 1, x: dx * 0.9, y: 0 });
    }
  };
  const up = (e: React.PointerEvent) => {
    const G = g.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 1) { // ikinci parmak kalktı: kalan parmakla kaydırmaya devam
      const [q] = [...pts.current.values()]; const c = st.current;
      g.current = { d0: 0, s0: c.s, cx: 0, cy: 0, x0: c.x, y0: c.y, sx: q.x, sy: q.y, moved: true, t: Date.now() };
      return;
    }
    if (pts.current.size) return;
    g.current = null;
    if (!G) return;
    const c = st.current;
    if (c.s < 1) { set({ s: 1, x: 0, y: 0 }, true); return; }
    if (c.s <= 1.01) {
      const dx = e.clientX - G.sx;
      if (G.moved && Math.abs(dx) > 60) { onSwipe(dx < 0 ? 1 : -1); }
      set({ s: 1, x: 0, y: 0 }, true);
      if (G.moved) return;
    }
    if (!G.moved && G.d0 === 0) {
      const now = Date.now();
      if (now - lastTap.current < 300) { lastTap.current = 0; c.s > 1.2 ? set({ s: 1, x: 0, y: 0 }, true) : zoomAt(2.5, e.clientX, e.clientY, true); }
      else lastTap.current = now;
    }
  };
  const step = (k: number) => { const r = el.current!.getBoundingClientRect(); zoomAt(st.current.s * k, r.left + r.width / 2, r.top + r.height / 2, true); };
  return (
    <div className={`zs${v.s > 1.01 ? ' zoomed' : ''}`} ref={el} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="zs-in" style={{ transform: `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`, transition: anim ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none' }}>{children}</div>
      <div className="zs-ctl" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-glass icon-btn" aria-label="Uzaklaştır" disabled={v.s <= 1.01} onClick={() => step(1 / 1.6)}><ZoomOut size={16} /></button>
        <span className="zs-pct mono">{Math.round(v.s * 100)}%</span>
        <button type="button" className="btn btn-glass icon-btn" aria-label="Yakınlaştır" disabled={v.s >= 5.99} onClick={() => step(1.6)}><ZoomIn size={16} /></button>
        <button type="button" className="btn btn-glass icon-btn" aria-label="Sığdır" disabled={v.s <= 1.01} onClick={() => set({ s: 1, x: 0, y: 0 }, true)}><Maximize size={15} /></button>
      </div>
    </div>
  );
}

export function Lightbox({ items, index, setIndex, onClose }: { items: Nft[]; index: number; setIndex: (i: number) => void; onClose: () => void }) {
  const n = items[index];
  const copy = useCopy();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const strip = useRef<HTMLDivElement>(null);
  const go = useCallback((d: number) => setIndex((index + d + items.length) % items.length), [index, items.length, setIndex]);
  useEffect(() => { setLoaded(false); setFailed(false); setMsg(''); }, [index]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [go, onClose]);
  useEffect(() => { strip.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [index]);
  useEffect(() => { [1, -1].forEach((d) => { const m = items[(index + d + items.length) % items.length]; if (m?.original) new Image().src = m.original; }); }, [index, items]);
  const from = Math.max(0, index - 25), to = Math.min(items.length, index + 26);
  const src = failed || !n.original ? n.thumb : n.original;
  const detail = [n.name, n.description, n.opensea, n.superrare].filter(Boolean).join('\n\n');
  async function save(video = false) { setBusy('save'); const r = await saveOriginal(n, video); toast.ok(r === 'saved' ? 'Orijinal dosya indirildi' : 'Orijinal yeni sekmede açıldı'); setBusy(''); }
  async function copyImg() { setBusy('img'); try { await copyImage(n); toast.ok('Görsel kopyalandı: Cmd+V ile yapıştır'); } catch (x) { toast.fail(x); } setBusy(''); }
  async function share(platform: 'x' | 'instagram') {
    setBusy(platform);
    try {
      const r = await shareOriginal(n, msg, platform);
      toast.ok(r === 'sheet' ? 'Paylaş menüsü açıldı' : platform === 'instagram' ? 'Metin kopyalandı; Instagram’da yapıştır' : r === 'clipboard' ? 'Görsel panoda: gönderi kutusunda ⌘+V ile yapıştır' : 'X açıldı; görseli Orijinali kaydet ile ekle');
    } catch (x) { if ((x as Error).name !== 'AbortError') toast.fail(x); }
    setBusy('');
  }
  return createPortal(
    <div className="lb" role="dialog" aria-modal="true" aria-label={n.name}>
      <div className="lb-bg" onClick={onClose} />
      <button type="button" className="lb-x btn btn-glass icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
      <button type="button" className="lb-nav l btn btn-glass icon-btn" onClick={() => go(-1)} aria-label="Önceki"><ChevronLeft size={20} /></button>
      <button type="button" className="lb-nav r btn btn-glass icon-btn" onClick={() => go(1)} aria-label="Sonraki"><ChevronRight size={20} /></button>
      <div className="lb-card glass">
        <div className="lb-stage">
          <ZoomStage onSwipe={go} resetKey={nftKey(n)}>
            {n.thumb && !loaded && <img className="lb-ph" src={n.thumb} alt="" draggable={false} />}
            {src && <img key={src} className="lb-img" src={src} alt={n.name} draggable={false} onLoad={() => setLoaded(true)} onError={() => { if (!failed && n.thumb) setFailed(true); }} style={{ opacity: loaded ? 1 : 0 }} />}
          </ZoomStage>
          {!loaded && <span className="lb-spin">Orijinal yükleniyor…</span>}
          <div className="lb-mnav">
            <button type="button" className="btn btn-glass icon-btn" onClick={() => go(-1)} aria-label="Önceki"><ChevronLeft size={18} /></button>
            <span className="small mono">{index + 1} / {items.length}</span>
            <button type="button" className="btn btn-glass icon-btn" onClick={() => go(1)} aria-label="Sonraki"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="lb-info">
          <div className="small muted">{index + 1} / {items.length} · #{n.tokenId.length > 8 ? n.tokenId.slice(-4) : n.tokenId}</div>
          <h2>{n.name}</h2>
          {n.description && <p className="lb-desc">{n.description}</p>}
          <div className="lb-actions">
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => save()}><Download size={13} />{busy === 'save' ? 'İniyor…' : 'Orijinali kaydet'}</button>
              <button type="button" className="btn btn-copy btn-sm" disabled={!!busy} onClick={copyImg}><Copy size={13} />{busy === 'img' ? 'Kopyalanıyor…' : 'Görseli kopyala (Cmd+V)'}</button>
              {n.video && <button type="button" className="btn btn-glass btn-sm" onClick={() => save(true)}><Download size={13} />Video</button>}
            </div>
            <div className="lb-grp"><span className="small muted"><Share2 size={12} /> Paylaş · metnin başına “{n.name}” otomatik eklenir</span>
              <textarea className="textarea" style={{ minHeight: 56 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Paylaşım metnin…" />
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => share('x')}>{busy === 'x' ? 'Hazırlanıyor…' : 'X'}</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => share('instagram')}>{busy === 'instagram' ? 'Hazırlanıyor…' : 'Instagram'}</button>
              </div></div>
            <div className="lb-grp"><span className="small muted">OpenSea</span>
              <div className="row" style={{ gap: 6 }}><a className="btn btn-glass btn-sm" href={n.opensea} target="_blank" rel="noreferrer" title="OpenSea'de aç">OS <ExternalLink size={13} /></a><button type="button" className="btn btn-copy btn-sm icon-only" title="OpenSea linkini kopyala" aria-label="OpenSea linkini kopyala" onClick={() => copy(n.opensea, 'OpenSea linki')}><Copy size={14} /></button></div></div>
            {n.superrare && <div className="lb-grp"><span className="small muted">SuperRare</span>
              <div className="row" style={{ gap: 6 }}><a className="btn btn-glass btn-sm" href={n.superrare} target="_blank" rel="noreferrer" title="SuperRare'de aç">SR <ExternalLink size={13} /></a><button type="button" className="btn btn-copy btn-sm icon-only" title="SuperRare linkini kopyala" aria-label="SuperRare linkini kopyala" onClick={() => copy(n.superrare!, 'SuperRare linki')}><Copy size={14} /></button></div></div>}
            <div className="row" style={{ gap: 6 }}>
              {n.original && <a className="btn btn-glass btn-sm" href={n.original} target="_blank" rel="noreferrer"><Expand size={13} />Orijinal bağlantı</a>}
              <button type="button" className="btn btn-copy btn-sm icon-only" title="Ad + açıklamayı kopyala" aria-label="Ad ve açıklamayı kopyala" onClick={() => copy(detail, 'Ad ve açıklama')}><Copy size={14} /></button>
            </div>
            <Workbench key={nftKey(n)} n={n} />
          </div>
        </div>
        <div className="lb-strip" ref={strip}>
          {items.slice(from, to).map((m, k) => (
            <button type="button" key={nftKey(m)} className={from + k === index ? 'on' : ''} onClick={() => setIndex(from + k)} aria-label={m.name}>{m.thumb && <img src={m.thumb} alt="" loading="lazy" />}</button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
