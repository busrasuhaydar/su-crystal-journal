import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CalendarPlus, ChevronLeft, ChevronRight, Lightbulb, ListPlus, Plus, Search } from 'lucide-react';
import { useWeather } from '../components/Shell';
import { useEditors } from '../components/Editors';
import { TaskRow } from '../components/TaskRow';
import { Empty, useToast } from '../components/ui';
import { ensureJournalDay, useCalendarRange, useCompleteTask, useHolidays, useIdeas, useJournal, useOverdue, useProfile, useProgress, useProjects, useSaveTask, useTasks, usePostsRange } from '../lib/data';
import { addDays, addMonths, toInstant, dayKeyOf, formatLong, formatRelative, hhmm, minutesOf, startOfWeek, startOfMonth, todayKey, formatShort, MONTHS, parseKey } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { flag } from '../lib/countries';
import { REMINDER_OPTIONS, RRULE_LABEL } from '../lib/types';
import { isCollectionProject, shareOriginal, useNfts } from '../lib/nft';
import { HeroArt } from '../components/HeroArt';
import { bostonTime, useHomePrefs } from '../lib/ui';
import { IDEA_CATEGORY_LABEL, OPP_DATE_LABEL, PLATFORM_LABEL, POST_STATUS_LABEL, type Platform, type Task } from '../lib/types';
import { EVENT_KIND_LABEL, PRIORITY_ORDER, PROJECT_STATUS_LABEL } from '../lib/types';

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function useMinute() {
  const [n, setN] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setN(new Date()), 30_000); return () => clearInterval(t); }, []);
  return n;
}
function greeting(min: number) {
  if (min < 5 * 60) return 'İyi geceler';
  if (min < 12 * 60) return 'Günaydın';
  if (min < 18 * 60) return 'İyi günler';
  return 'İyi akşamlar';
}

interface Item { id: string; at: number; end: number; title: string; sub: string; task?: Task; event?: import('../lib/types').CalEvent; done: boolean }

export default function Home() {
  const today = todayKey();
  const now = useMinute();
  const nowMin = minutesOf(now);
  const { openTask, openEvent } = useEditors();
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => { const m = window.matchMedia('(max-width: 760px)'); const f = () => setNarrow(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  const complete = useCompleteTask();
  const toast = useToast();
  const profile = useProfile();
  const weather = useWeather();
  const hp = useHomePrefs();
  const wk = startOfWeek(today);
  const week = useCalendarRange(wk, addDays(wk, 6));
  const upcoming = useCalendarRange(addDays(today, 1), addDays(today, 30));
  const hol = useHolidays(wk, addDays(today, 30));
  const overdue = useOverdue();
  const projects = useProjects();
  const progress = useProgress();

  const todayData = {
    tasks: (week.data?.tasks ?? []).filter((t) => t.status !== 'cancelled' && (t.starts_at ? dayKeyOf(t.starts_at) === today : t.due_date === today)),
    events: (week.data?.events ?? []).filter((e) => dayKeyOf(e.starts_at) <= today && dayKeyOf(e.ends_at) >= today),
  };
  const tasks = todayData.tasks;
  const done = tasks.filter((t) => t.status === 'done').length;
  const timed: Item[] = [
    ...tasks.filter((t) => t.starts_at).map((t) => ({ id: t.id, at: minutesOf(t.starts_at!), end: t.ends_at ? minutesOf(t.ends_at) : minutesOf(t.starts_at!) + 30, title: t.title, sub: 'Görev', task: t, done: t.status === 'done' })),
    ...todayData.events.filter((e) => !e.all_day).map((e) => ({ id: e.id, at: dayKeyOf(e.starts_at) < today ? 0 : minutesOf(e.starts_at), end: dayKeyOf(e.ends_at) > today ? 24 * 60 : minutesOf(e.ends_at), title: e.title, sub: EVENT_KIND_LABEL[e.kind], event: e, done: false })),
  ].sort((a, b) => a.at - b.at);
  const allDay = todayData.events.filter((e) => e.all_day);
  const untimed = tasks.filter((t) => !t.starts_at).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const current = timed.find((i) => !i.done && i.at <= nowMin && i.end > nowMin);
  const next = timed.find((i) => !i.done && i.at > nowMin);
  const focus = current ?? next;
  const remaining = tasks.length - done;
  const overdueN = overdue.data?.length ?? 0;
  const upcomingEvents = (upcoming.data?.events ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 5);
  const upcomingHol = hol.list.filter((h) => h.kind === 'public' && h.day > today).slice(0, 3);
  const deadlines = (projects.data ?? []).filter((p) => p.target_date && p.target_date >= today && p.status !== 'completed').sort((a, b) => a.target_date!.localeCompare(b.target_date!)).slice(0, 3);
  const active = (projects.data ?? []).filter((p) => p.status === 'active' || p.status === 'planning').slice(0, 4);
  const nftData = useNfts().data;
  const coverOf = (p: import('../lib/types').Project) => { if (!isCollectionProject(p)) return null; const slug = p.slug.replace('koleksiyon-', ''); return nftData?.items.find((n) => n.c === slug && n.thumb)?.thumb ?? null; };
  const w = weather.data;

  const bits: string[] = [];
  if (tasks.length || todayData.events.length) bits.push(`Bugün ${tasks.length} görev ve ${todayData.events.length} etkinlik var`);
  else bits.push('Bugün takvimin boş, sakin bir gün');
  if (done && remaining === 0 && tasks.length) bits.push('hepsini bitirdin, harikasın');
  else if (current) bits.push(`şu an “${current.title}” zamanı`);
  else if (next) bits.push(`sıradaki iş ${hhmm(next.at)} “${next.title}”`);
  if (overdueN) bits.push(`${overdueN} bekleyen görev seni bekliyor`);

  async function tick(t: Task) {
    try { await complete.mutateAsync({ id: t.id, done: t.status !== 'done' }); if (t.status !== 'done') toast.ok('Tamamlandı ✓'); } catch (x) { toast.fail(x); }
  }
  const openSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

  return (
    <>
      <section className="glass hero cr-hero" data-glass="window">
        <div className="hero-main">
          <div className="hero-top"><h1 className="cr-date">{formatLong(today)}</h1>
          <div className="hero-chips">
            {w ? (
              <div className="wchip" title={w.tip}>
                <w.Icon size={30} color="var(--orange-500)" strokeWidth={1.6} />
                <span className="wtemp">{w.temp}°</span>
                <span className="wtxt">{w.label}<small>{w.lo}° / {w.hi}° · yağış %{w.rain}</small></span>
              </div>
            ) : <div className="wchip small muted">Hava durumu yükleniyor…</div>}
            {hp.boston && <div className="wchip boston" title="ABD Doğu saati" aria-label={`ABD saati ${bostonTime(now)}`}><b className="mono">{bostonTime(now)}</b></div>}
          </div>
          </div>
          <p className="cr-greet"><span className="script">{greeting(nowMin)} {profile.data?.display_name ?? 'Su'}</span> <span className="cr-heart" aria-hidden="true">♡</span></p>
          <p className="hero-sum">{bits.join(' · ')}.</p>
          {tasks.length > 0 && <div className="prog" style={{ maxWidth: 420 }} title={`${done}/${tasks.length} görev tamamlandı`}><b style={{ width: `${Math.round((done / tasks.length) * 100)}%` }} /></div>}
          <div className="qa">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openTask({ due_date: today })}><Plus size={14} />Görev</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => openEvent({})}><CalendarPlus size={14} />Etkinlik</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => { const el = document.getElementById('qi') as HTMLTextAreaElement | null; el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus(); }}><Lightbulb size={14} />Fikir</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => document.getElementById('todo-add')?.focus()}><ListPlus size={14} />Yapılacak</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={openSearch}><Search size={14} />Ara <kbd className="kbd">⌘K</kbd></button>
            <Link className="btn btn-glass btn-sm" to={`/gun/${today}`}>Günlük plan <ArrowRight size={14} /></Link>
          </div>
        </div>
        <HeroArt />
      </section>

      {narrow && <IdeasCard />}

      <div className="home-grid">
        <div className="col">
        <section className="glass panel" hidden={!hp.visible('plan')}>
          <div className="panel-head"><h2>{hp.title('plan', 'Bugünün planı')}</h2><span className="count">{timed.length + untimed.length + allDay.length}</span></div>
          {focus && (
            <div className="now-card">
              <span className="small" style={{ color: 'var(--rose-600)', fontWeight: 700 }}>{current ? 'ŞİMDİ' : `SIRADAKİ · ${next!.at - nowMin < 60 ? `${next!.at - nowMin} dk sonra` : hhmm(next!.at)}`}</span>
              <b style={{ fontSize: 17 }}>{focus.title}</b>
              <div className="row" style={{ gap: 6 }}>
                <span className="small muted">{hhmm(focus.at)}–{hhmm(focus.end % (24 * 60))} · {focus.sub}</span>
                <span style={{ flex: 1 }} />
                {focus.task && <button type="button" className="btn btn-primary btn-sm" onClick={() => tick(focus.task!)}><Check size={14} />Tamamla</button>}
                <button type="button" className="btn btn-glass btn-sm" onClick={() => focus.task ? openTask(focus.task) : openEvent(focus.event!)}>Aç</button>
              </div>
            </div>
          )}
          {timed.length + untimed.length + allDay.length === 0 ? <Empty title="Sakin bir gün">Bir görev ya da etkinlik ekleyerek günü planla.</Empty> : (
            <div className="plan todo">
              {allDay.map((e) => <button type="button" key={e.id} className="plan-row" onClick={() => openEvent(e)}><span className="pdot ev" aria-hidden="true" /><span className="pt"><b>{e.title}</b> <span className="small muted">· {EVENT_KIND_LABEL[e.kind]}</span></span><span className="mono">Tüm gün</span></button>)}
              {timed.map((i) => (
                <div key={i.id} className={`plan-row${i.done ? ' done' : ''}${i === current ? ' live' : ''}${!i.done && i.end <= nowMin ? ' past' : ''}`} role="button" tabIndex={0}
                  onClick={() => i.task ? openTask(i.task) : openEvent(i.event!)} onKeyDown={(e) => e.key === 'Enter' && (i.task ? openTask(i.task) : openEvent(i.event!))}>
                  {i.task ? <button type="button" className={`check${i.done ? ' on' : ''}`} aria-label={i.done ? 'Geri al' : 'Tamamla'} onClick={(e) => { e.stopPropagation(); tick(i.task!); }}>{i.done && <Check size={14} strokeWidth={3} />}</button> : <span className="pdot ev" aria-hidden="true" />}
                  <span className="pt"><b>{i.title}</b> <span className="small muted">· {i.sub}</span></span>
                  <span className="mono">{hhmm(i.at)}</span>
                </div>
              ))}
              {untimed.length > 0 && timed.length + allDay.length > 0 && <div className="plan-sep">Gün içinde</div>}
              {untimed.map((t) => (
                <div key={t.id} className={`plan-row${t.status === 'done' ? ' done' : ''}`} role="button" tabIndex={0} onClick={() => openTask(t)} onKeyDown={(e) => e.key === 'Enter' && openTask(t)}>
                  <button type="button" className={`check${t.status === 'done' ? ' on' : ''}`} aria-label={t.status === 'done' ? 'Geri al' : 'Tamamla'} onClick={(e) => { e.stopPropagation(); tick(t); }}>{t.status === 'done' && <Check size={14} strokeWidth={3} />}</button>
                  <span className="pt"><b>{t.title}</b></span>
                  <i className={`dot p-${t.priority}`} title="Öncelik" />
                </div>
              ))}
            </div>
          )}
          <PlanAdd today={today} />
          {overdueN > 0 && (
            <>
              <h3 style={{ marginTop: 18, marginBottom: 8, color: 'var(--orange-600)' }}>Bekleyen {overdueN} görev</h3>
              <div className="task-list">{overdue.data!.slice(0, 3).map((t) => <TaskRow key={t.id} task={t} overdue />)}</div>
              {overdueN > 3 && <Link className="small" to="/gorevler">Tümünü gör →</Link>}
            </>
          )}
          <DailyGoal />
        </section>
        <MiniMonth />
        </div>

        <div className="col">
          <Routines />
          <TodoList />
        </div>

        <div className="col"><ArtOfTheDay />{!narrow && <IdeasCard />}</div>

        <section className="glass panel span-all" hidden={!hp.visible('week')}>
          <div className="panel-head"><h2>{hp.title('week', 'Bu hafta')}</h2><Link className="small" to="/takvim/hafta">Takvim →</Link></div>
          <WeekStrip wk={wk} today={today} data={week.data} hol={hol.byDay} />
        </section>

        <section className="glass panel" hidden={!hp.visible('upcoming')}>
          <div className="panel-head"><h2>{hp.title('upcoming', 'Yaklaşanlar')}</h2><Link className="small" to="/takvim/ajanda">Ajanda</Link></div>
          <div className="agenda-mini">
            {upcomingEvents.map((e) => (
              <div key={e.id} className="it" style={{ cursor: 'pointer' }} onClick={() => openEvent(e)}><span className="mono">{formatShort(dayKeyOf(e.starts_at))}</span><span><b style={{ fontWeight: 600 }}>{e.title}</b> <span className="small muted">· {EVENT_KIND_LABEL[e.kind]}{e.all_day ? '' : ` · ${hhmm(minutesOf(e.starts_at))}`}</span></span></div>
            ))}
            {deadlines.map((p) => (
              <div key={p.id} className="it"><span className="mono" style={{ color: 'var(--orange-600)' }}>{formatShort(p.target_date!)}</span><Link to={`/projeler/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}><b style={{ fontWeight: 600 }}>{p.title}</b> <span className="small muted">· proje hedefi</span></Link></div>
            ))}
            {(upcoming.data?.oppDates ?? []).filter((d) => d.opportunities && ['deadline', 'opening', 'delivery'].includes(d.kind)).slice(0, 3).map((d) => (
              <div key={d.id} className="it"><span className="mono" style={{ color: 'var(--lilac-500)' }}>{formatShort(d.day)}</span><span><Link to={`/firsatlar/${d.opportunity_id}`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}>{d.opportunities!.title}</Link> <span className="small muted">· {OPP_DATE_LABEL[d.kind]}{d.certainty !== 'confirmed' ? ' (kesinleşmedi)' : ''}</span></span></div>
            ))}
            {upcomingHol.map((h) => (
              <div key={h.id} className="it"><span className="mono">{formatShort(h.day)}</span><span>{flag('TR')} {h.local_name}{h.certainty !== 'confirmed' && <span className="small muted"> · kesinleşmedi</span>}</span></div>
            ))}
            {!upcomingEvents.length && !deadlines.length && !upcomingHol.length && <p className="small muted">Önümüzdeki 30 günde kayıt yok.</p>}
          </div>
        </section>

        <section className="glass panel" hidden={!hp.visible('social')}><SocialSummary /></section>

        <section className="glass panel" hidden={!hp.visible('projects')}>
          <div className="panel-head"><h2>{hp.title('projects', 'Projelerim')}</h2><Link className="small" to="/projeler">Tümü →</Link></div>
          {active.length === 0 ? <Empty title="Henüz proje yok"><Link to="/projeler">İlk projeni ekle</Link>; ilerleme kendiliğinden hesaplanır.</Empty> : (
            <div className="cr-projs">
              {active.map((p) => {
                const pr = progress.data?.get(p.id);
                const img = coverOf(p);
                return (
                  <Link key={p.id} to={`/projeler/${p.slug}`} className="card cr-proj" style={{ ['--pc' as string]: p.color }}>
                    <span className="cr-proj-img" style={{ background: `linear-gradient(135deg, ${p.color}66, #FFE3F1 55%, #DDF5F8)` }}>
                      {img ? <img src={img} alt="" loading="lazy" /> : <span className="cr-proj-ic">{p.icon ?? '✦'}</span>}
                      <span className="cr-proj-pct mono">%{pr?.progress ?? 0}</span>
                    </span>
                    <b>{p.title}</b>
                    <span className="small muted"><i className="dot" style={{ background: p.color }} /> {PROJECT_STATUS_LABEL[p.status]} · {pr?.done_tasks ?? 0}/{pr?.total_tasks ?? 0} görev{p.target_date ? ` · ${formatRelative(p.target_date)}` : ''}</span>
                    <span className="prog"><b style={{ width: `${pr?.progress ?? 0}%` }} /></span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function TodoList() {
  const hp = useHomePrefs();
  const all = useTasks();
  const save = useSaveTask();
  const complete = useCompleteTask();
  const { openTask } = useEditors();
  const toast = useToast();
  const [t, setT] = useState('');
  const today = todayKey();
  const list = (all.data ?? []).filter((x) => !x.due_date && !x.starts_at && !x.parent_task_id && x.status !== 'cancelled');
  const open = list.filter((x) => x.status !== 'done').sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const doneL = list.filter((x) => x.status === 'done');
  async function add() {
    const v = t.trim(); if (!v) return;
    try { await save.mutateAsync({ title: v.slice(0, 200), priority: 'medium', status: 'todo' }); setT(''); } catch (x) { toast.fail(x); }
  }
  if (!hp.visible('todo')) return null;
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>{hp.title('todo', 'Yapılacaklar')}</h2><span className="count">{open.length}</span></div>
      <form className="row" style={{ flexWrap: 'nowrap', marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input id="todo-add" className="input" value={t} onChange={(e) => setT(e.target.value)} placeholder="Yeni yapılacak… (Enter)" />
        <button type="submit" className="btn btn-primary icon-btn" aria-label="Ekle"><Plus size={16} /></button>
      </form>
      {list.length === 0 ? <p className="small muted">Liste boş. Tarihi olmayan işleri buraya yaz, yaptıkça işaretle.</p> : (
        <div className="todo">
          {[...open, ...doneL].map((x) => (
            <div key={x.id} className={`todo-row${x.status === 'done' ? ' done' : ''}`}>
              <button type="button" className={`check${x.status === 'done' ? ' on' : ''}`} aria-label="İşaretle" onClick={async () => { try { await complete.mutateAsync({ id: x.id, done: x.status !== 'done' }); } catch (e) { toast.fail(e); } }}>{x.status === 'done' && <Check size={14} strokeWidth={3} />}</button>
              <button type="button" className="todo-t" onClick={() => openTask(x)}><i className={`dot p-${x.priority}`} />{x.title}</button>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <Link className="small" to="/gorevler">Tüm görevler →</Link>
        {open.length > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={async () => { try { await save.mutateAsync({ id: open[0].id, title: open[0].title, due_date: today }); toast.ok('İlk iş bugüne alındı'); } catch (e) { toast.fail(e); } }}>İlkini bugüne al</button>}
      </div>
    </section>
  );
}

/** Bugünün planı: yapılacaklar listesi gibi hızlı ekleme (bugüne görev). */
function PlanAdd({ today }: { today: string }) {
  const save = useSaveTask();
  const toast = useToast();
  const [t, setT] = useState('');
  async function add() {
    const v = t.trim(); if (!v) return;
    try { await save.mutateAsync({ title: v.slice(0, 200), priority: 'medium', status: 'todo', due_date: today }); setT(''); } catch (x) { toast.fail(x); }
  }
  return (
    <form className="plan-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <span className="check ghost" aria-hidden="true"><Plus size={13} strokeWidth={2.6} /></span>
      <input className="input" value={t} onChange={(e) => setT(e.target.value)} placeholder="Bugüne yapılacak ekle…" aria-label="Bugüne yapılacak ekle" />
      <button type="submit" className="btn btn-primary btn-sm icon-only" aria-label="Ekle" disabled={!t.trim() || save.isPending}><Check size={15} /></button>
    </form>
  );
}

function IdeasCard() {
  const hp = useHomePrefs();
  const qc = useQueryClient();
  const toast = useToast();
  const ideas = useIdeas();
  const [t, setT] = useState('');
  const recent = (ideas.data ?? []).filter((i) => i.status !== 'archived').slice(0, 5);
  async function save() {
    const v = t.trim(); if (!v) return;
    const [first, ...rest] = v.split('\n');
    const { error } = await supabase.from('ideas').insert({ title: first.slice(0, 200), body: rest.join('\n').trim() || null, category: 'art' });
    if (error) return toast.fail(error);
    setT(''); qc.invalidateQueries({ queryKey: ['ideas'] }); toast.ok('Fikir kaydedildi ✦');
  }
  if (!hp.visible('ideas')) return null;
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>{hp.title('ideas', 'Aklımdakiler')}</h2><Link className="small" to="/fikirler">Tüm fikirler →</Link></div>
      <textarea id="qi" className="textarea" style={{ minHeight: 70 }} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} placeholder="Aklına gelen her şeyi yaz… (⌘+Enter kaydeder)" />
      <button type="button" className="btn btn-primary btn-sm" style={{ margin: '8px 0 12px' }} onClick={save}>Fikri kaydet</button>
      {recent.length === 0 ? <p className="small muted">Henüz fikir yok.</p> : (
        <div className="idea-list">
          {recent.map((i) => (
            <Link key={i.id} to="/fikirler" className="idea-it">
              <b>{i.title}</b>
              <span className="small muted">{IDEA_CATEGORY_LABEL[i.category]} · {formatRelative(dayKeyOf(i.created_at))}{dayKeyOf(i.created_at) !== todayKey() && <time className="idea-when" dateTime={i.created_at}>{formatShort(dayKeyOf(i.created_at))} · {hhmm(minutesOf(i.created_at))}</time>}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function DailyGoal() {
  const today = todayKey();
  const j = useJournal(today);
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState('');
  useEffect(() => { setV(j.data?.day?.goal ?? ''); }, [j.data?.day?.goal]);
  async function save() {
    if ((j.data?.day?.goal ?? '') === v) return;
    try {
      const jd = await ensureJournalDay(today);
      const { error } = await supabase.from('journal_days').update({ goal: v || null }).eq('id', jd.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['journal'] }); toast.ok('Günün hedefi kaydedildi');
    } catch (x) { toast.fail(x); }
  }
  return <input id="home-goal" className="goal" aria-label="Günün hedefi" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Günün hedefi: bugün neyi başarmak istiyorsun?" />;
}

function SocialSummary() {
  const hp = useHomePrefs();
  const today = todayKey();
  const week = usePostsRange(today, addDays(today, 6));
  const posts = week.data ?? [];
  const todays = posts.filter((p) => dayKeyOf(p.scheduled_at!) === today);
  const count = (pl: Platform) => posts.filter((p) => p.status !== 'published' && p.post_targets?.some((t) => t.platform === pl)).length;
  const failed = posts.filter((p) => p.status === 'failed').length;
  return (
    <>
      <div className="panel-head"><h2>{hp.title('social', 'Sosyal Medya')}</h2><Link className="small" to="/sosyal">Tümü →</Link></div>
      <div className="stat-row">{(['instagram', 'x', 'youtube', 'website'] as Platform[]).map((pl) => <div key={pl} className="stat" style={{ minWidth: 70 }}><b>{count(pl)}</b><span>{PLATFORM_LABEL[pl]}</span></div>)}</div>
      <p className="small muted" style={{ margin: '8px 0' }}>Önümüzdeki 7 günde planlı · {posts.filter((p) => p.status === 'published').length} yayınlandı{failed ? ` · ${failed} başarısız` : ''}</p>
      {todays.length > 0 && <div className="agenda-mini">{todays.map((p) => <div key={p.id} className="it"><span className="mono">{hhmm(minutesOf(p.scheduled_at!))}</span><span><b style={{ fontWeight: 600 }}>{p.title}</b> <span className="small muted">· {POST_STATUS_LABEL[p.status]}</span></span></div>)}</div>}
    </>
  );
}


function ArtOfTheDay() {
  const hp = useHomePrefs();
  const nfts = useNfts();
  const toast = useToast();
  const [shift, setShift] = useState(0);
  const items = nfts.data?.items ?? [];
  if (!items.length || !hp.visible('art')) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  const n = items[(day * 7 + shift * 13) % items.length];
  const col = nfts.data!.collections.find((c) => c.slug === n.c);
  const to = `/koleksiyonlar/${n.c}?eser=${n.contract.slice(0, 10).toLowerCase()}-${n.tokenId}`;
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>{hp.title('art', 'Günün eseri')}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShift((x) => x + 1)}>Başka</button></div>
      <Link to={to} className="aotd">{n.thumb && <img src={n.thumb} alt={n.name} />}</Link>
      <b style={{ display: 'block', marginTop: 8 }}>{n.name}</b>
      <span className="small muted">{col?.name}</span>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <Link className="btn btn-primary btn-sm" to={to}>Aç · fikir yaz</Link>
        <button type="button" className="btn btn-glass btn-sm" onClick={async () => { try { await shareOriginal(n); } catch (x) { if ((x as Error).name !== 'AbortError') toast.fail(x); } }}>Tweet / paylaş</button>
      </div>
    </section>
  );
}

/** Tekrarlayan düzenler (ör. D vitamini): son yapılan, sıradaki tarih, kalan gün; tek tıkla tamamla. */
function Routines() {
  const hp = useHomePrefs();
  const all = useTasks();
  const complete = useCompleteTask();
  const toast = useToast();
  const today = todayKey();
  const rows = (all.data ?? []).filter((t) => t.rrule && (t.status === 'todo' || t.status === 'doing') && t.due_date).map((t) => {
    const root = t.recurrence_parent ?? t.id;
    const last = (all.data ?? []).filter((x) => x.status === 'done' && x.completed_at && ((x.recurrence_parent ?? x.id) === root)).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))[0];
    const days = Math.round((Date.parse(t.due_date! + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
    const every = Number(/INTERVAL=(\d+)/.exec(t.rrule!)?.[1] ?? 1);
    return { t, last, days, every };
  }).sort((a, b) => a.days - b.days);
  const save = useSaveTask();
  const { openTask } = useEditors();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', day: today, time: '09:00', rrule: '', rem: '0' });
  if (!hp.visible('routines')) return null;
  async function add() {
    if (!f.title.trim()) return toast.fail(new Error('Ne hatırlatılacak? Bir başlık yaz.'));
    try {
      const [h, m] = f.time.split(':').map(Number);
      const starts_at = f.time ? toInstant(f.day || today, h * 60 + m) : null;
      await save.mutateAsync({ title: f.title.trim(), due_date: f.day || today, starts_at, ends_at: starts_at ? new Date(Date.parse(starts_at) + 15 * 60000).toISOString() : null, rrule: f.rrule || null, category: 'Kişisel', priority: 'medium', status: 'todo', reminderMinutes: Number(f.rem) });
      toast.ok('Hatırlatma eklendi'); setF({ title: '', day: today, time: '09:00', rrule: '', rem: f.rem }); setAdding(false);
    } catch (x) { toast.fail(x); }
  }
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>{hp.title('routines', 'Hatırlatmalar')}</h2><span className="row" style={{ gap: 6 }}><span className="count">{rows.length}</span><button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)}><Plus size={14} />Ekle</button></span></div>
      {adding && (
        <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <input id="rm-title" className="input" autoFocus placeholder="ör. D vitamini al, faturayı öde, Ayşe'yi ara" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <div className="grid-2">
            <input id="rm-day" type="date" className="input" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
            <input id="rm-time" type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
          <div className="grid-2">
            <select id="rm-rr" className="select" value={f.rrule} onChange={(e) => setF({ ...f, rrule: e.target.value })}>{Object.entries(RRULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select id="rm-rem" className="select" value={f.rem} onChange={(e) => setF({ ...f, rem: e.target.value })}>{REMINDER_OPTIONS.filter(([k]) => k !== '').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={save.isPending}><Check size={14} />Kaydet</button><button type="button" className="btn btn-glass btn-sm" onClick={() => openTask({ due_date: f.day || today, rrule: f.rrule || null, title: f.title })}><ListPlus size={14} />Ayrıntılı</button></div>
        </div>
      )}
      {!rows.length && !adding && <p className="small muted" style={{ margin: 0 }}>Henüz düzenli bir hatırlatma yok. “Ekle” ile tekrar eden (her gün, hafta, ay) ya da tek seferlik hatırlatma kur.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(({ t, last, days, every }) => (
          <div key={t.id} className={`routine${days <= 1 ? ' soon' : ''}`}>
            <div style={{ minWidth: 0, cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => openTask(t)} onKeyDown={(e) => e.key === 'Enter' && openTask(t)}>
              <b>{t.title}</b>
              <div className="small muted">{last ? `Son: ${formatShort(dayKeyOf(last.completed_at!))} · ` : ''}Sıradaki: {formatShort(t.due_date!)} · {days < 0 ? `${-days} gün gecikti` : days === 0 ? 'bugün' : days === 1 ? 'yarın' : `${days} gün sonra`}{every > 1 ? ` · her ${every} günde bir` : ''}</div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={days > 1} title={days > 1 ? 'Zamanı gelince işaretleyebilirsin' : 'Yaptım'}
              onClick={async () => { try { await complete.mutateAsync({ id: t.id, done: true }); toast.ok('Tamamlandı, sıradaki tarih hazır'); } catch (x) { toast.fail(x); } }}><Check size={14} />Yaptım</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Bu hafta: her günün gerçek içeriği (tatil adı, etkinlik, görev, hatırlatma); hepsi tıklanabilir, boş günde “+” ile ekle. */
function WeekStrip({ wk, today, data, hol }: { wk: string; today: string; data?: import('../lib/data').CalData; hol: Map<string, import('../lib/types').Holiday[]> }) {
  const { openTask, openEvent } = useEditors();
  const nav = useNavigate();
  return (
    <div className="week-strip">
      {DAY_SHORT.map((d, i) => {
        const k = addDays(wk, i);
        type Chip = { id: string; label: string; cls: string; run: () => void };
        const chips: Chip[] = [
          ...(hol.get(k) ?? []).filter((h) => h.kind !== 'observance' || h.country === 'US').map((h) => ({ id: h.id, label: `${flag(h.country)} ${h.country === 'US' ? h.name : h.local_name}`, cls: 'h', run: () => nav(`/gun/${k}`) })),
          ...(data?.events ?? []).filter((e) => dayKeyOf(e.starts_at) <= k && dayKeyOf(e.ends_at) >= k).map((e) => ({ id: e.id, label: `${e.all_day ? '' : hhmm(minutesOf(e.starts_at)) + ' '}${e.title}`, cls: 'e', run: () => openEvent(e) })),
          ...(data?.tasks ?? []).filter((t) => t.status !== 'cancelled' && (t.starts_at ? dayKeyOf(t.starts_at) === k : t.due_date === k)).map((t) => ({ id: t.id, label: `${t.starts_at ? hhmm(minutesOf(t.starts_at)) + ' ' : ''}${t.title}`, cls: `t${t.status === 'done' ? ' done' : ''}`, run: () => openTask(t) })),
          ...(data?.extras ?? []).filter((x) => x.day === k).map((x) => ({ id: x.id, label: x.label, cls: 'x', run: () => (x.href ? nav(`/${x.href}`) : nav(`/gun/${k}`)) })),
        ];
        return (
          <div key={k} className={`wday${k === today ? ' today' : ''}`}>
            <Link to={`/gun/${k}`} className="wd-head"><span className="small">{d}</span><b>{Number(k.slice(8))}</b></Link>
            <div className="wd-list">
              {chips.slice(0, 4).map((c) => <button type="button" key={c.id} className={`wd-chip ${c.cls}`} title={c.label} onClick={c.run}>{c.label}</button>)}
              {chips.length > 4 && <Link to={`/gun/${k}`} className="wd-more">+{chips.length - 4} daha</Link>}
              <button type="button" className="wd-add" aria-label={`${formatShort(k)} için ekle`} title="Bu güne görev ekle" onClick={() => openTask({ due_date: k })}><Plus size={12} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Bugünün özeti: tarih, sayılar ve tamamlanma halkası (kristal). */

/** Mini ay takvimi: her günde görev / etkinlik / fırsat / tatil noktaları; güne tıklayınca günlük plan açılır. */
function MiniMonth() {
  const today = todayKey();
  const [anchor, setAnchor] = useState(() => startOfMonth(today));
  const start = startOfWeek(anchor);
  const end = addDays(start, 41);
  const cal = useCalendarRange(start, end);
  const hol = useHolidays(start, end);
  const { y, m } = parseKey(anchor);
  const mark = new Map<string, Set<string>>();
  const add = (k: string, c: string) => { if (!mark.has(k)) mark.set(k, new Set()); mark.get(k)!.add(c); };
  for (const t of cal.data?.tasks ?? []) { if (t.status === 'cancelled') continue; const k = t.starts_at ? dayKeyOf(t.starts_at) : t.due_date; if (k) add(k, 't'); }
  for (const e of cal.data?.events ?? []) { let k = dayKeyOf(e.starts_at); const z = dayKeyOf(e.ends_at); for (let i = 0; i < 40 && k <= z; i++) { add(k, 'e'); k = addDays(k, 1); } }
  for (const d of cal.data?.oppDates ?? []) add(d.day, 'o');
  for (const [k, hs] of hol.byDay) if (hs.some((h) => h.kind === 'public')) add(k, 'h');
  return (
    <section className="glass panel cr-month">
      <div className="panel-head">
        <h2>{MONTHS[m]} {y}</h2>
        <span className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-glass icon-btn" aria-label="Önceki ay" onClick={() => setAnchor(addMonths(anchor, -1))}><ChevronLeft size={16} /></button>
          <button type="button" className="btn btn-glass icon-btn" aria-label="Sonraki ay" onClick={() => setAnchor(addMonths(anchor, 1))}><ChevronRight size={16} /></button>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => setAnchor(startOfMonth(today))}>Bugün</button>
        </span>
      </div>
      <div className="cr-mm" role="grid" aria-label={`${MONTHS[m]} ${y}`}>
        {DAY_SHORT.map((d) => <span key={d} className="cr-mm-h">{d}</span>)}
        {Array.from({ length: 42 }, (_, i) => {
          const k = addDays(start, i);
          const out = parseKey(k).m !== m;
          const dots = [...(mark.get(k) ?? [])];
          return (
            <Link key={k} to={`/gun/${k}`} className={`cr-mm-d${out ? ' out' : ''}${k === today ? ' today' : ''}`} aria-label={`${formatShort(k)}${dots.length ? `, ${dots.length} tür kayıt` : ''}`}>
              <span>{Number(k.slice(8))}</span>
              {dots.length > 0 && <i className="cr-mm-dots">{dots.slice(0, 3).map((c) => <b key={c} className={c} />)}</i>}
            </Link>
          );
        })}
      </div>
      <div className="cr-mm-leg small"><span><b className="t" />Görev</span><span><b className="e" />Etkinlik</span><span><b className="o" />Başvuru</span><span><b className="h" />Tatil</span></div>
    </section>
  );
}
