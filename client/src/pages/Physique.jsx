import { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  getPhysiqueWeeks, createPhysiqueWeek, updatePhysiqueWeek, deletePhysiqueWeek,
  uploadPhysiquePhoto, deletePhysiquePhoto,
} from '../api';
import SkeletonLoader from '../components/SkeletonLoader';
import { getCached, setCached, invalidateCache } from '../utils/cache';

const PHYSIQUE_CACHE_TTL = 300000; // 5 minutes

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay());
  return localDateStr(d);
}

function todayStr() {
  return localDateStr(new Date());
}

// Downscale + re-encode to JPEG so large phone-camera photos don't blow past
// the API's body-size limit or time out on upload.
function resizeImageFile(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const [header, b64] = dataUrl.split(',');
      resolve({ b64, mediaType: header.match(/data:([^;]+)/)[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read image')); };
    img.src = objectUrl;
  });
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function formatDateRange(weekStart) {
  const sun = new Date(weekStart + 'T12:00:00');
  const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(sun)} – ${fmt(sat)}`;
}

const PHOTO_TYPES = ['front', 'side', 'back'];

// ─── Main page ─────────────────────────────────────────────────────────────

export default function Physique() {
  const [view, setView]             = useState('timeline');
  const [weeks, setWeeks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [lightbox, setLightbox]     = useState(null);
  const [captureSheet, setCaptureSheet] = useState(null);
  const [editSheet, setEditSheet]   = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const isSunday       = new Date().getDay() === 0;
  const thisWeekStart  = getWeekStart(todayStr());

  async function load() {
    setLoading(true);
    try {
      const cached = getCached('physique-weeks', PHYSIQUE_CACHE_TTL);
      let data;
      if (cached) {
        data = cached;
      } else {
        data = await getPhysiqueWeeks();
        setCached('physique-weeks', data);
      }
      setWeeks(data.sort((a, b) => a.week_start.localeCompare(b.week_start)));
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function weekNum(weekId) {
    const idx = weeks.findIndex(w => w.id === weekId);
    return idx === -1 ? weeks.length + 1 : idx + 1;
  }

  async function handlePhotoFile(file, week, photoType) {
    if (!file) return;
    setUploading(true);
    try {
      const { b64, mediaType } = await resizeImageFile(file);
      let weekId = week?.id;
      if (!weekId) {
        const created = await createPhysiqueWeek({ week_start: week.week_start });
        weekId = created.id;
      }
      await uploadPhysiquePhoto({
        week_id: weekId, photo_type: photoType,
        image_base64: b64, media_type: mediaType,
      });
      invalidateCache('physique-weeks');
      await load();
      setCaptureSheet(null);
    } catch (err) {
      alert(err.message || 'Photo upload failed. Please try again.');
    }
    setUploading(false);
  }

  async function handleDeletePhoto(photo) {
    await deletePhysiquePhoto(photo.id);
    invalidateCache('physique-weeks');
    await load();
    setLightbox(null);
  }

  async function handleSaveWeek(week, data) {
    if (week?.id) {
      await updatePhysiqueWeek(week.id, data);
    } else {
      await createPhysiqueWeek({ week_start: week.week_start, ...data });
    }
    invalidateCache('physique-weeks');
    await load();
    setEditSheet(null);
  }

  async function handleDeleteWeek(weekId) {
    if (!confirm('Delete this week and all its photos?')) return;
    setDeletingId(weekId);
    await deletePhysiqueWeek(weekId);
    invalidateCache('physique-weeks');
    await load();
    setDeletingId(null);
  }

  const existingThisWeek = weeks.find(w => w.week_start === thisWeekStart);
  const thisWeek = existingThisWeek || { week_start: thisWeekStart, photos: [] };
  const pastWeeks = [...weeks].reverse().filter(w => w.week_start !== thisWeekStart);

  const chartData = weeks.map((w, i) => ({
    label: `Wk ${i + 1}`,
    weight: w.weight ?? null,
    body_fat: w.body_fat ?? null,
  }));

  function openLightbox(week, photoType) {
    const photo = week.photos?.find(p => p.photo_type === photoType);
    if (!photo) return;
    setLightbox({ photo, weekNum: weekNum(week.id), photoType });
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="page-title" style={{ margin: 0 }}>Physique</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['timeline', 'progress'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: view === v ? 'var(--accent)' : 'var(--surface2)',
              color: view === v ? '#fff' : 'var(--text-muted)',
              fontWeight: 600, fontSize: 13, textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </div>
      </div>

      {isSunday && (
        <div style={{
          background: 'var(--accent)', color: '#fff', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600,
        }}>
          It's Sunday — time to take your weekly photos!
        </div>
      )}

      {loading
        ? <SkeletonLoader count={3} height={220} />
        : view === 'timeline'
          ? (
            <div>
              <WeekCard
                week={thisWeek}
                num={weekNum(thisWeek.id)}
                isThisWeek
                onPhoto={type => setCaptureSheet({ week: thisWeek, photoType: type })}
                onView={(type) => openLightbox(thisWeek, type)}
                onEdit={() => setEditSheet(thisWeek)}
                onDelete={thisWeek.id ? () => handleDeleteWeek(thisWeek.id) : null}
                deleting={deletingId === thisWeek.id}
              />
              {pastWeeks.map(w => (
                <WeekCard
                  key={w.id}
                  week={w}
                  num={weekNum(w.id)}
                  isThisWeek={false}
                  onPhoto={type => setCaptureSheet({ week: w, photoType: type })}
                  onView={(type) => openLightbox(w, type)}
                  onEdit={() => setEditSheet(w)}
                  onDelete={() => handleDeleteWeek(w.id)}
                  deleting={deletingId === w.id}
                />
              ))}
              {weeks.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 16, fontSize: 14 }}>
                  Add your first photos or log your stats above.
                </div>
              )}
            </div>
          )
          : <ProgressView weeks={weeks} chartData={chartData} />
      }

      {captureSheet && (
        <PhotoCaptureSheet
          week={captureSheet.week}
          photoType={captureSheet.photoType}
          uploading={uploading}
          onFile={file => handlePhotoFile(file, captureSheet.week, captureSheet.photoType)}
          onClose={() => { if (!uploading) setCaptureSheet(null); }}
        />
      )}

      {editSheet && (
        <WeekEditSheet
          week={editSheet}
          onSave={data => handleSaveWeek(editSheet, data)}
          onClose={() => setEditSheet(null)}
        />
      )}

      {lightbox && (
        <Lightbox
          photo={lightbox.photo}
          weekNum={lightbox.weekNum}
          photoType={lightbox.photoType}
          onClose={() => setLightbox(null)}
          onDelete={() => handleDeletePhoto(lightbox.photo)}
        />
      )}
    </div>
  );
}

// ─── WeekCard ───────────────────────────────────────────────────────────────

function WeekCard({ week, num, isThisWeek, onPhoto, onView, onEdit, onDelete, deleting }) {
  const photoMap = {};
  for (const p of (week.photos || [])) photoMap[p.photo_type] = p;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Week {num}
            {isThisWeek && (
              <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--accent)',
                color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                THIS WEEK
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {formatDateRange(week.week_start)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onEdit} style={iconBtnStyle()} title="Edit stats">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          {onDelete && (
            <button onClick={onDelete} disabled={deleting} style={iconBtnStyle('#ff4d4f')} title="Delete week">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Photo slots */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {PHOTO_TYPES.map(type => {
          const photo = photoMap[type];
          return (
            <div key={type} style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 8,
              overflow: 'hidden', background: 'var(--surface2)' }}>
              {photo ? (
                <img
                  src={photo.cloudinary_url}
                  alt={type}
                  loading="lazy"
                  onClick={() => onView(type)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                />
              ) : (
                <button onClick={() => onPhoto(type)} style={{
                  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                  borderRadius: 8, background: 'none', cursor: 'pointer', color: 'var(--text-muted)', gap: 4,
                }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span style={{ fontSize: 10, textTransform: 'capitalize', fontWeight: 600 }}>{type}</span>
                </button>
              )}
              {photo && (
                <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center' }}>
                  <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10,
                    fontWeight: 600, borderRadius: 4, padding: '2px 6px', textTransform: 'capitalize' }}>
                    {type}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats row */}
      {(week.weight || week.body_fat || week.avg_calories > 0 || week.total_workouts > 0) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          {week.weight     && <StatPill label="Weight"   value={`${round1(week.weight)} lbs`} />}
          {week.body_fat   && <StatPill label="Body Fat" value={`${round1(week.body_fat)}%`} />}
          {week.avg_calories > 0 && <StatPill label="Avg Cal" value={round1(week.avg_calories)} />}
          {week.total_workouts > 0 && <StatPill label="Workouts" value={week.total_workouts} />}
        </div>
      )}
      {week.notes && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {week.notes}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function iconBtnStyle(color) {
  return {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
    color: color || 'var(--text-muted)', display: 'flex', alignItems: 'center',
  };
}

// ─── ProgressView ───────────────────────────────────────────────────────────

function ProgressView({ weeks, chartData }) {
  const weightData = chartData.filter(d => d.weight !== null);
  const fatData    = chartData.filter(d => d.body_fat !== null);

  const latest  = weeks[weeks.length - 1];
  const earliest = weeks[0];
  const weightDiff = (latest?.weight && earliest?.weight)
    ? round1(latest.weight - earliest.weight) : null;
  const fatDiff = (latest?.body_fat && earliest?.body_fat)
    ? round1(latest.body_fat - earliest.body_fat) : null;

  if (weeks.length < 2) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 40, fontSize: 14 }}>
        Log at least 2 weeks of data to see progress charts.
      </div>
    );
  }

  return (
    <div>
      {weightDiff !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOTAL CHANGE</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: parseFloat(weightDiff) <= 0 ? 'var(--accent)' : '#ff6b35' }}>
              {parseFloat(weightDiff) > 0 ? '+' : ''}{weightDiff} lbs
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>body weight</div>
          </div>
          {fatDiff !== null && (
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>TOTAL CHANGE</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: parseFloat(fatDiff) <= 0 ? 'var(--accent)' : '#ff6b35' }}>
                {parseFloat(fatDiff) > 0 ? '+' : ''}{fatDiff}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>body fat</div>
            </div>
          )}
        </div>
      )}

      {weightData.length >= 2 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Body Weight (lbs)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={['auto','auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-muted)', fontSize: 12 }}
                itemStyle={{ color: 'var(--accent)', fontSize: 13 }}
                formatter={v => [`${round1(v)} lbs`, 'Weight']}
              />
              <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--accent)' }} activeDot={{ r: 6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {fatData.length >= 2 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Body Fat (%)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={fatData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={['auto','auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-muted)', fontSize: 12 }}
                itemStyle={{ color: '#ff6b35', fontSize: 13 }}
                formatter={v => [`${round1(v)}%`, 'Body Fat']}
              />
              <Line type="monotone" dataKey="body_fat" stroke="#ff6b35" strokeWidth={2.5}
                dot={{ r: 4, fill: '#ff6b35' }} activeDot={{ r: 6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── PhotoCaptureSheet ──────────────────────────────────────────────────────

function PhotoCaptureSheet({ week, photoType, uploading, onFile, onClose }) {
  const fileRef = useRef();

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, textTransform: 'capitalize' }}>
          {photoType} Photo
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Choose a photo from your gallery
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleChange}
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn-primary"
          style={{ width: '100%', marginBottom: 12, opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? 'Uploading...' : 'Choose Photo'}
        </button>

        <button
          onClick={onClose}
          disabled={uploading}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── WeekEditSheet ──────────────────────────────────────────────────────────

function WeekEditSheet({ week, onSave, onClose }) {
  const [weight,  setWeight]  = useState(week?.weight  ?? '');
  const [bodyFat, setBodyFat] = useState(week?.body_fat ?? '');
  const [notes,   setNotes]   = useState(week?.notes   ?? '');
  const [saving,  setSaving]  = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        weight:   weight  !== '' ? parseFloat(weight)  : null,
        body_fat: bodyFat !== '' ? parseFloat(bodyFat) : null,
        notes,
      });
    } catch {}
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Log Week Stats</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Weight (lbs)</label>
            <input
              type="number" inputMode="decimal" step="0.1" placeholder="e.g. 82.5"
              value={weight} onChange={e => setWeight(e.target.value)}
              style={inputStyle()}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Body Fat (%)</label>
            <input
              type="number" inputMode="decimal" step="0.1" placeholder="e.g. 18.5"
              value={bodyFat} onChange={e => setBodyFat(e.target.value)}
              style={inputStyle()}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="How are you feeling this week?"
            rows={3}
            style={{ ...inputStyle(), resize: 'none', fontFamily: 'inherit' }}
          />
        </div>

        <button
          onClick={handleSave} disabled={saving}
          className="btn-primary"
          style={{ width: '100%', marginBottom: 10, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onClose} style={{
          width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
          background: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: 15, cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
    border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text)', fontSize: 15, outline: 'none',
  };
}

// ─── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({ photo, weekNum, photoType, onClose, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        zIndex: 1000, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Top bar */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', color: '#fff',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Week {weekNum} — <span style={{ textTransform: 'capitalize' }}>{photoType}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} style={{
              background: 'rgba(255,77,79,0.2)', border: '1px solid rgba(255,77,79,0.5)',
              color: '#ff4d4f', borderRadius: 8, padding: '6px 12px',
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>Delete</button>
          ) : (
            <>
              <button onClick={onDelete} style={{
                background: '#ff4d4f', border: 'none', color: '#fff',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Confirm</button>
              <button onClick={() => setConfirming(false)} style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Cancel</button>
            </>
          )}
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Image */}
      <img
        src={photo.cloudinary_url}
        alt={photoType}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
      />
    </div>
  );
}
