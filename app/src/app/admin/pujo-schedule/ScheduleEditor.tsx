'use client';

/**
 * Admin → Pujo schedule editor. Everything in plain words: a volunteer should be
 * able to change a time from their phone at the venue without being shown how.
 *
 * - Switches and timings are saved together with the Save button.
 * - The flyer is replaced / removed at once (its own route), so it never waits on Save.
 * - "Visitors see right now" is worked out live from what is on screen.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePujoScheduleAction, type ScheduleInput, type DayInput, type RiteInput } from './actions';
import {
  ICON_PATHS,
  RITE_KINDS,
  dayParts,
  etParts,
  flatten,
  fmtTime,
  iconFor,
  isDate,
  nextWhen,
  parsePastedLines,
  sanitizeSchedule,
  scheduleVisible,
  statusAt,
  toMin,
  HHMM,
  type RiteKind,
} from '@/lib/pujo-schedule/model';
import './schedule-admin.css';

export type AdminFlyer = { src: string; width: number; height: number; name: string; bytes: number; bundled: boolean };

type R = RiteInput & { key: string };
type D = Omit<DayInput, 'rites'> & { key: string; open: boolean; rites: R[] };
type Form = Omit<ScheduleInput, 'days'> & { days: D[] };

let seq = 0;
const uid = () => `k${++seq}`;

function toForm(s: ScheduleInput, openDate?: string): Form {
  const open = openDate && s.days.some((d) => d.date === openDate) ? openDate : s.days[0]?.date;
  return {
    ...s,
    days: s.days.map((d) => ({ ...d, key: uid(), open: d.date === open, rites: d.rites.map((r) => ({ ...r, key: uid() })) })),
  };
}
function strip(f: Form): ScheduleInput {
  return {
    enabled: f.enabled,
    hideAfter: f.hideAfter,
    showFlyer: f.showFlyer,
    allowDownload: f.allowDownload,
    days: f.days.map((d) => ({
      date: d.date,
      en: d.en.trim(),
      bn: d.bn.trim(),
      rites: d.rites.map((r) => ({ t: r.t, end: r.end, name: r.name.trim(), bn: r.bn.trim(), kind: r.kind, note: r.note.trim() })),
    })),
  };
}
function dayLabel(date: string) {
  if (!isDate(date)) return 'New day';
  const p = dayParts(date);
  return `${p.short} ${p.dd} ${p.mon}`;
}
function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function fmtBytes(n: number) {
  if (!n) return '';
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Anything over ~4 MB (or HEIC etc.) is redrawn as a JPEG first — uploads cap at 4.5 MB. */
async function shrink(file: File): Promise<File> {
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (ok && file.size <= 4 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image.'))), 'image/jpeg', 0.9));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

function KindIcon({ kind, name }: { kind: string; name: string }) {
  const d = ICON_PATHS[iconFor({ kind: (kind as RiteKind) || 'puja', name })];
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="psa-switchrow">
      <span>
        <span className="psa-switchlabel">{label}</span>
        {hint && <span className="psa-hint">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="psa-switch" onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
}

export default function ScheduleEditor({
  initial,
  flyer: flyer0,
  storageMissing,
  nowISO,
}: {
  initial: ScheduleInput;
  flyer: AdminFlyer | null;
  storageMissing: boolean;
  nowISO: string;
}) {
  const router = useRouter();
  const today = etParts(new Date(nowISO)).date;
  const [form, setForm] = useState<Form>(() => toForm(initial, today));
  const [baseline, setBaseline] = useState(() => JSON.stringify(strip(toForm(initial))));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date(nowISO));

  const [flyer, setFlyer] = useState(flyer0);
  const [flyerBusy, setFlyerBusy] = useState('');
  const [flyerErr, setFlyerErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [paste, setPaste] = useState('');
  const [pasteDay, setPasteDay] = useState(() => form.days[0]?.key ?? '');
  const [pastePending, setPastePending] = useState<{ dayKey: string; rites: R[]; skipped: string[] } | null>(null);
  const [pasteMsg, setPasteMsg] = useState('');

  const dirty = JSON.stringify(strip(form)) !== baseline;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── edits ──
  const patch = (p: Partial<Form>) => {
    setSaved('');
    setForm((f) => ({ ...f, ...p }));
  };
  const patchDay = (key: string, p: Partial<D>) => {
    setSaved('');
    setForm((f) => ({ ...f, days: f.days.map((d) => (d.key === key ? { ...d, ...p } : d)) }));
  };
  const patchRite = (dayKey: string, riteKey: string, p: Partial<R>) => {
    setSaved('');
    setForm((f) => ({
      ...f,
      days: f.days.map((d) => (d.key === dayKey ? { ...d, rites: d.rites.map((r) => (r.key === riteKey ? { ...r, ...p } : r)) } : d)),
    }));
  };
  const addRite = (dayKey: string) => {
    setForm((f) => ({
      ...f,
      days: f.days.map((d) => {
        if (d.key !== dayKey) return d;
        const last = d.rites[d.rites.length - 1];
        const m = last && HHMM.test(last.t) ? Math.min(toMin(last.t) + 30, 23 * 60 + 30) : 10 * 60;
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        return { ...d, rites: [...d.rites, { key: uid(), t, end: '', name: '', bn: '', kind: 'puja', note: '' }] };
      }),
    }));
    setSaved('');
  };
  const removeRite = (dayKey: string, riteKey: string) => {
    setSaved('');
    setForm((f) => ({ ...f, days: f.days.map((d) => (d.key === dayKey ? { ...d, rites: d.rites.filter((r) => r.key !== riteKey) } : d)) }));
  };
  const addDay = () => {
    setSaved('');
    setForm((f) => {
      const last = [...f.days].reverse().find((d) => isDate(d.date));
      const date = last ? addDays(last.date, 1) : today;
      return { ...f, days: [...f.days.map((d) => ({ ...d, open: false })), { key: uid(), date, en: '', bn: '', open: true, rites: [] }] };
    });
  };
  const removeDay = (key: string) => {
    const d = form.days.find((x) => x.key === key);
    if (d && d.rites.length && !window.confirm(`Remove ${dayLabel(d.date)} and its ${d.rites.length} rituals?`)) return;
    setSaved('');
    setForm((f) => ({ ...f, days: f.days.filter((x) => x.key !== key) }));
  };

  const save = () =>
    startTransition(async () => {
      setErrors([]);
      // put each day's rows in time order, the way visitors will see them
      const sorted: Form = {
        ...form,
        days: [...form.days]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => ({ ...d, rites: [...d.rites].sort((a, b) => (HHMM.test(a.t) && HHMM.test(b.t) ? toMin(a.t) - toMin(b.t) : 0)) })),
      };
      const res = await savePujoScheduleAction(strip(sorted));
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setForm(sorted);
      setBaseline(JSON.stringify(strip(sorted)));
      setSaved('Saved — the homepage shows it now.');
      router.refresh();
    });

  // ── what visitors see right now, from what is on screen ──
  const preview = useMemo(() => {
    const s = sanitizeSchedule({ ...strip(form), v: 1, flyer: null });
    if (!form.enabled) return { live: false, text: 'Hidden — the section is switched off.' };
    if (s.days.length === 0) return { live: false, text: 'Hidden — there are no timings yet.' };
    if (!scheduleVisible(s, now)) return { live: false, text: 'Hidden — today is after the take-down date.' };
    const rites = flatten(s.days);
    const at = etParts(now);
    const st = statusAt(rites, s.days, at);
    if (st.phase === 'before') return { live: true, text: `“Pujo begins ${st.daysTo === 1 ? 'tomorrow' : `in ${st.daysTo} days`}”` };
    if (st.phase === 'after') return { live: true, text: '“Shubho Bijoya · Ashche bochor abar hobe”' };
    if (st.now >= 0) {
      const tail = st.next >= 0 ? `, then ${rites[st.next].name} (${nextWhen(st, rites, at)})` : '';
      return { live: true, text: `“Now at the mandap: ${rites[st.now].name}”${tail}` };
    }
    return { live: true, text: `“Up next: ${rites[st.next].name} · ${nextWhen(st, rites, at)}”` };
  }, [form, now]);

  // ── flyer ──
  const uploadFlyer = async (file: File) => {
    setFlyerErr('');
    setFlyerBusy('Uploading the flyer…');
    try {
      const f = await shrink(file);
      const body = new FormData();
      body.set('file', f);
      const res = await fetch('/api/admin/pujo-schedule/flyer', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      setFlyer({ src: json.flyer.src, width: json.flyer.width, height: json.flyer.height, name: f.name, bytes: f.size, bundled: false });
      router.refresh();
    } catch (e) {
      setFlyerErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setFlyerBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeFlyer = async () => {
    if (!window.confirm('Remove the flyer? Visitors will no longer see the “See the full flyer” and Download buttons.')) return;
    setFlyerErr('');
    setFlyerBusy('Removing…');
    try {
      const res = await fetch('/api/admin/pujo-schedule/flyer', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove it — try again.');
      setFlyer(null);
      router.refresh();
    } catch (e) {
      setFlyerErr(e instanceof Error ? e.message : 'Could not remove it.');
    } finally {
      setFlyerBusy('');
    }
  };

  // ── paste ──
  const runPaste = () => {
    setPasteMsg('');
    const { rites, skipped } = parsePastedLines(paste);
    if (!rites.length) {
      setPasteMsg('No times found. Start each line with a time, like “10:30 AM – Maha Saptami Puja”.');
      return;
    }
    const day = form.days.find((d) => d.key === pasteDay) ?? form.days[0];
    if (!day) {
      setPasteMsg('Add a day first.');
      return;
    }
    const rows: R[] = rites.map((r) => ({ key: uid(), t: r.t, end: r.end ?? '', name: r.name, bn: r.bn ?? '', kind: r.kind, note: '' }));
    if (day.rites.length) setPastePending({ dayKey: day.key, rites: rows, skipped });
    else applyPaste(day.key, rows, skipped);
  };
  const applyPaste = (dayKey: string, rows: R[], skipped: string[]) => {
    setForm((f) => ({ ...f, days: f.days.map((d) => (d.key === dayKey ? { ...d, open: true, rites: rows } : d)) }));
    setPastePending(null);
    setSaved('');
    setPasteMsg(
      `Filled ${rows.length} row${rows.length === 1 ? '' : 's'}.${skipped.length ? ` Skipped ${skipped.length} line${skipped.length === 1 ? '' : 's'} without a time.` : ''} Check them, then Save.`,
    );
  };

  const pasteTarget = pastePending ? form.days.find((d) => d.key === pastePending.dayKey) : null;

  return (
    <div className="psa">
      <div className="psa-top">
        <div>
          <h1 className="psa-h1">
            Pujo schedule <span lang="bn">পুজোর নির্ঘণ্ট</span>
          </h1>
          <p className="psa-lede">
            The “Pujo, hour by hour” terracotta wall on the homepage. Change a time here and the website changes with it — nothing goes live until you press Save.
          </p>
        </div>
        <a className="btn-secondary !py-2.5 !px-5 text-sm" href="/#schedule" target="_blank" rel="noopener">
          Preview homepage ↗
        </a>
      </div>

      <div className="psa-cols">
        <section className="festive-card psa-card" aria-labelledby="psa-days">
          <div className="psa-cardhead">
            <h2 id="psa-days">Days and timings</h2>
            <span className="psa-hint">Philadelphia time · rows are put in time order when you save</span>
          </div>

          {form.days.map((d) => {
            const sorted = [...d.rites].filter((r) => HHMM.test(r.t)).sort((a, b) => toMin(a.t) - toMin(b.t));
            const range = sorted.length ? `${fmtTime(sorted[0].t)}${sorted.length > 1 ? ` – ${fmtTime(sorted[sorted.length - 1].t)}` : ''}` : '';
            return (
              <div key={d.key} className={`psa-day${d.open ? ' is-open' : ''}`}>
                {!d.open ? (
                  <div className="psa-dayclosed">
                    <b>{dayLabel(d.date)}</b>
                    <span className="psa-dayname">
                      {d.en}
                      {d.bn && <span lang="bn"> {d.bn}</span>}
                    </span>
                    <span className="psa-hint">
                      {d.rites.length} ritual{d.rites.length === 1 ? '' : 's'}
                      {range && ` · ${range}`}
                    </span>
                    <button type="button" className="btn-secondary !py-1.5 !px-4 text-sm" onClick={() => patchDay(d.key, { open: true })}>
                      Edit
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="psa-dayhead">
                      <label className="psa-field psa-date">
                        <span>Date</span>
                        <input className="input" type="date" value={d.date} onChange={(e) => patchDay(d.key, { date: e.target.value })} />
                      </label>
                      <div className="psa-dayacts">
                        <button type="button" className="psa-link psa-link--danger" onClick={() => removeDay(d.key)}>
                          Remove day
                        </button>
                        <button type="button" className="btn-secondary !py-1.5 !px-4 text-sm" onClick={() => patchDay(d.key, { open: false })}>
                          Done
                        </button>
                      </div>
                      <label className="psa-field">
                        <span>Day name (English)</span>
                        <input className="input" value={d.en} maxLength={60} placeholder="Maha Saptami & Maha Ashtami" onChange={(e) => patchDay(d.key, { en: e.target.value })} />
                      </label>
                      <label className="psa-field">
                        <span>Day name (Bengali)</span>
                        <input className="input" lang="bn" value={d.bn} maxLength={60} placeholder="মহাসপ্তমী ও মহাষ্টমী" onChange={(e) => patchDay(d.key, { bn: e.target.value })} />
                      </label>
                    </div>

                    {d.rites.map((r, ri) => (
                      <div key={r.key} className={`psa-rite${r.kind === 'anjali' ? ' is-anjali' : ''}`}>
                        <span className="psa-ico" title={RITE_KINDS.find((k) => k.value === r.kind)?.label}>
                          <KindIcon kind={r.kind} name={r.name} />
                        </span>
                        <label className="psa-field">
                          <span>Starts</span>
                          <input className="input" type="time" value={r.t} onChange={(e) => patchRite(d.key, r.key, { t: e.target.value })} />
                        </label>
                        <label className="psa-field">
                          <span>
                            Until <em>(optional)</em>
                          </span>
                          <input className="input" type="time" value={r.end} onChange={(e) => patchRite(d.key, r.key, { end: e.target.value })} />
                        </label>
                        <label className="psa-field">
                          <span>Type</span>
                          <select className="input" value={r.kind} onChange={(e) => patchRite(d.key, r.key, { kind: e.target.value })}>
                            {RITE_KINDS.map((k) => (
                              <option key={k.value} value={k.value}>
                                {k.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className="psa-remove" aria-label={`Remove row ${ri + 1}${r.name ? ` (${r.name})` : ''}`} onClick={() => removeRite(d.key, r.key)}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
                          </svg>
                        </button>
                        <label className="psa-field psa-name">
                          <span>Ritual</span>
                          <input className="input" value={r.name} maxLength={80} placeholder="Maha Ashtami Pushpanjali" onChange={(e) => patchRite(d.key, r.key, { name: e.target.value })} />
                        </label>
                        <label className="psa-field psa-bn">
                          <span>In Bengali</span>
                          <input className="input" lang="bn" value={r.bn} maxLength={80} placeholder="মহাষ্টমী পুষ্পাঞ্জলি" onChange={(e) => patchRite(d.key, r.key, { bn: e.target.value })} />
                        </label>
                        <label className="psa-field psa-note">
                          <span>
                            One line shown when someone taps it <em>(optional)</em>
                          </span>
                          <input className="input" value={r.note} maxLength={160} onChange={(e) => patchRite(d.key, r.key, { note: e.target.value })} />
                        </label>
                      </div>
                    ))}
                    <button type="button" className="psa-add" onClick={() => addRite(d.key)}>
                      + Add a ritual to {dayLabel(d.date)}
                    </button>
                  </>
                )}
              </div>
            );
          })}
          <button type="button" className="psa-add psa-add--day" onClick={addDay}>
            + Add a day
          </button>
        </section>

        <div className="psa-side">
          <section className="festive-card psa-card" aria-labelledby="psa-home">
            <h2 id="psa-home">On the homepage</h2>
            <Switch on={form.enabled} onChange={(v) => patch({ enabled: v })} label="Show the Pujo schedule" />
            <label className="psa-field">
              <span>Take it down automatically after</span>
              <input className="input" type="date" value={form.hideAfter} onChange={(e) => patch({ hideAfter: e.target.value })} />
            </label>
            <p className="psa-hint">After the last ritual it says “Shubho Bijoya · Ashche bochor abar hobe” until this date, then disappears on its own. Leave blank to keep it up.</p>
            <Switch on={form.showFlyer} onChange={(v) => patch({ showFlyer: v })} label="“See the full flyer” button" />
            <Switch on={form.allowDownload} onChange={(v) => patch({ allowDownload: v })} label="Let visitors download the flyer" />
            <div className={`psa-live${preview.live ? '' : ' is-off'}`}>
              <span className="psa-dot" aria-hidden="true" />
              <span>
                {preview.live ? 'Visitors see right now: ' : ''}
                <b>{preview.text}</b>
                {dirty && <em> (once you save)</em>}
              </span>
            </div>
          </section>

          <section className="festive-card psa-card" aria-labelledby="psa-flyer">
            <h2 id="psa-flyer">The flyer</h2>
            {storageMissing && <p className="psa-err">File storage isn’t connected in Vercel (Storage → Blob), so a new flyer can’t be saved yet.</p>}
            {flyer ? (
              <div className="psa-flyer">
                <a href={flyer.src} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flyer.src} alt="The current Pujo flyer" width={flyer.width} height={flyer.height} />
                </a>
                <div>
                  <div className="psa-file">{flyer.name}</div>
                  <div className="psa-hint">
                    {flyer.width} × {flyer.height}
                    {flyer.bytes ? ` · ${fmtBytes(flyer.bytes)}` : ''}
                    {flyer.bundled ? ' · the 2026 flyer that came with the site' : ''}
                  </div>
                  <div className="psa-flyeracts">
                    <button type="button" className="btn-secondary !py-1.5 !px-4 text-sm" disabled={!!flyerBusy} onClick={() => fileRef.current?.click()}>
                      Replace
                    </button>
                    <button type="button" className="btn-secondary !py-1.5 !px-4 text-sm" disabled={!!flyerBusy} onClick={removeFlyer}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-primary !py-2.5 !px-5 text-sm w-fit" disabled={!!flyerBusy} onClick={() => fileRef.current?.click()}>
                Upload the flyer
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFlyer(f);
              }}
            />
            {flyerBusy && <p className="psa-hint" role="status">{flyerBusy}</p>}
            {flyerErr && <p className="psa-err" role="alert">{flyerErr}</p>}
            <p className="psa-warn">Replacing or removing the flyer happens straight away. The flyer is a picture, so the website can’t read times off it — after a new flyer, check the timings still match.</p>
          </section>

          <section className="festive-card psa-card" aria-labelledby="psa-paste">
            <h2 id="psa-paste">Paste from the flyer</h2>
            <p className="psa-hint">One ritual per line, time first. Fills that day’s rows — you can still edit them before saving.</p>
            <label className="psa-field">
              <span>Lines</span>
              <textarea
                className="input psa-textarea"
                rows={6}
                value={paste}
                placeholder={'10:30 AM – Maha Saptami Puja\n12:00 PM – Maha Saptami Pushpanjali\n2:00 PM–2:30 PM – Maha Ashtami Pushpanjali'}
                onChange={(e) => setPaste(e.target.value)}
              />
            </label>
            <label className="psa-field">
              <span>Put them on</span>
              <select className="input" value={pasteDay} onChange={(e) => setPasteDay(e.target.value)}>
                {form.days.map((d) => (
                  <option key={d.key} value={d.key}>
                    {dayLabel(d.date)}
                    {d.en ? ` · ${d.en}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {pastePending && pasteTarget ? (
              <div className="psa-confirm" role="alert">
                <span>
                  Replace {dayLabel(pasteTarget.date)}’s {pasteTarget.rites.length} rows with these {pastePending.rites.length}?
                </span>
                <div className="psa-flyeracts">
                  <button type="button" className="btn-primary !py-1.5 !px-4 text-sm" onClick={() => applyPaste(pastePending.dayKey, pastePending.rites, pastePending.skipped)}>
                    Replace
                  </button>
                  <button type="button" className="btn-secondary !py-1.5 !px-4 text-sm" onClick={() => setPastePending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn-secondary !py-2 !px-5 text-sm w-fit" disabled={!paste.trim() || !form.days.length} onClick={runPaste}>
                Fill the rows
              </button>
            )}
            {pasteMsg && <p className="psa-hint" role="status">{pasteMsg}</p>}
          </section>
        </div>
      </div>

      <div className={`psa-savebar${dirty ? ' is-dirty' : ''}`}>
        {errors.length > 0 && (
          <ul className="psa-errors" role="alert">
            {errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 8 && <li>…and {errors.length - 8} more.</li>}
          </ul>
        )}
        <div className="psa-saverow">
          <span className="psa-hint" role="status">
            {saved || (dirty ? 'You have unsaved changes.' : 'Everything is saved.')}
          </span>
          <button type="button" className="btn-primary !py-2.5 !px-6 text-sm" disabled={pending || !dirty} onClick={save}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

