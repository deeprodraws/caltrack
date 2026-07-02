import { useState, useRef } from 'react';
import { scanFood } from '../api';

const CONFIDENCE_COLOR = { high: '#34d399', medium: '#fbbf24', low: '#f87171' };
const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function MacroInput({ label, value, onChange, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <input
        type="number" min="0" step="0.1" inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '7px 10px', color, fontFamily: 'inherit',
          fontSize: 14, fontWeight: 600, outline: 'none',
        }}
      />
    </div>
  );
}

export default function PhotoScanner({ date, onSave, onClose }) {
  const [phase, setPhase] = useState('capture'); // capture | scanning | review | error
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null); // { base64, mediaType }
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  function resetInputs() {
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  }

  // ── File selected from camera or gallery ──────────────────────────────────
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPreview(dataUrl);

      // strip "data:image/jpeg;base64," prefix
      const [header, base64] = dataUrl.split(',');
      const mediaType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      setImageData({ base64, mediaType });
      await runScan(base64, mediaType);
    };
    reader.readAsDataURL(file);
  }

  async function runScan(base64, mediaType) {
    setPhase('scanning');
    setError('');
    try {
      const result = await scanFood(base64, mediaType);
      if (!result.items || result.items.length === 0) {
        setError('No food detected in this photo. Try a clearer image or better lighting.');
        setPhase('error');
        return;
      }
      setItems(result.items.map((item, i) => ({ ...item, included: true, id: i })));
      setPhase('review');
    } catch (err) {
      setError(err.message || 'Scan failed. Check your internet connection and API key.');
      setPhase('error');
    }
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function handleSave() {
    const included = items.filter(i => i.included);
    onSave(included.map(item => ({
      date,
      food_name: item.name,
      calories: Number(item.calories) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbs) || 0,
      fat: Number(item.fat) || 0,
    })));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>
              {phase === 'capture' && '📷 Scan Food Photo'}
              {phase === 'scanning' && '🔍 Analyzing…'}
              {phase === 'review' && '✅ Review AI Results'}
              {phase === 'error' && '⚠️ Scan Failed'}
            </h3>
            {phase === 'capture' && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Take a photo or upload an image</p>}
            {phase === 'review' && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Edit values before saving</p>}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {/* ── Capture phase ─────────────────────────────────────────────── */}
          {phase === 'capture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Single input without capture= so it shows OS sheet (Take Photo / Library).
                  capture="environment" causes mobile browsers to push/pop history,
                  which makes React Router navigate back and close the scanner. */}
              <input ref={cameraRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              <input ref={galleryRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

              <button
                onClick={() => cameraRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: '28px 24px', background: 'var(--surface2)',
                  border: '2px dashed var(--border)', borderRadius: 12, cursor: 'pointer',
                  color: 'var(--text)', transition: 'border-color 0.15s', width: '100%',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 36 }}>📷</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Take a Photo</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Camera or gallery — your choice</div>
                </div>
              </button>

              <button
                onClick={() => galleryRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 12, cursor: 'pointer', color: 'var(--text)',
                  transition: 'border-color 0.15s', width: '100%',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 28 }}>🖼️</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Upload from Gallery</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Choose an existing photo</div>
                </div>
              </button>

              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                Works best with good lighting and a clear view of the food
              </div>
            </div>
          )}

          {/* ── Scanning phase ────────────────────────────────────────────── */}
          {phase === 'scanning' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              {preview && (
                <img src={preview} alt="Scanning" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10, marginBottom: 20, objectFit: 'contain' }} />
              )}
              <div style={{ marginBottom: 14 }}>
                <ScanSpinner />
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Gemini is identifying food items and estimating nutrition…</p>
            </div>
          )}

          {/* ── Error phase ───────────────────────────────────────────────── */}
          {phase === 'error' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              {preview && (
                <img src={preview} alt="Failed scan" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 10, marginBottom: 16, objectFit: 'contain', opacity: 0.5 }} />
              )}
              <div style={{
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 10, padding: '14px 18px', marginBottom: 20, textAlign: 'left',
              }}>
                <div style={{ color: '#f87171', fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Error</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setPhase('capture'); setPreview(null); resetInputs(); }} style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  padding: '9px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Try Again</button>
                <button onClick={onClose} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                  padding: '9px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Review phase ──────────────────────────────────────────────── */}
          {phase === 'review' && (
            <div>
              {preview && (
                <img src={preview} alt="Scanned food" style={{ width: '100%', maxHeight: 180, borderRadius: 10, marginBottom: 20, objectFit: 'cover' }} />
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {items.map(item => (
                  <div key={item.id} style={{
                    background: 'var(--surface2)', border: `1px solid ${item.included ? 'var(--border)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 10, padding: '14px 16px', opacity: item.included ? 1 : 0.45,
                    transition: 'opacity 0.2s, border-color 0.2s',
                  }}>
                    {/* Item header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={e => updateItem(item.id, 'included', e.target.checked)}
                        style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <input
                          value={item.name}
                          onChange={e => updateItem(item.id, 'name', e.target.value)}
                          style={{
                            width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                            color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                            paddingBottom: 2, marginBottom: 4, outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: CONFIDENCE_COLOR[item.confidence] || 'var(--text-muted)', fontWeight: 600 }}>
                            ● {CONFIDENCE_LABEL[item.confidence] || item.confidence}
                          </span>
                          {item.serving_description && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {item.serving_description}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Macro inputs */}
                    <div className="modal-macros">
                      <MacroInput label="Calories" value={item.calories} onChange={v => updateItem(item.id, 'calories', v)} color="#6c63ff" />
                      <MacroInput label="Protein g" value={item.protein} onChange={v => updateItem(item.id, 'protein', v)} color="#60a5fa" />
                      <MacroInput label="Carbs g" value={item.carbs} onChange={v => updateItem(item.id, 'carbs', v)} color="#fbbf24" />
                      <MacroInput label="Fat g" value={item.fat} onChange={v => updateItem(item.id, 'fat', v)} color="#fb923c" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              {items.filter(i => i.included).length > 0 && (
                <div style={{
                  background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13,
                  display: 'flex', gap: 16, flexWrap: 'wrap',
                }}>
                  {(() => {
                    const inc = items.filter(i => i.included);
                    const totals = inc.reduce((acc, i) => ({
                      cal: acc.cal + (Number(i.calories) || 0),
                      p: acc.p + (Number(i.protein) || 0),
                      c: acc.c + (Number(i.carbs) || 0),
                      f: acc.f + (Number(i.fat) || 0),
                    }), { cal: 0, p: 0, c: 0, f: 0 });
                    return (
                      <>
                        <span>{inc.length} item{inc.length !== 1 ? 's' : ''} selected</span>
                        <span style={{ color: '#6c63ff', fontWeight: 600 }}>{round1(totals.cal)} kcal</span>
                        <span style={{ color: '#60a5fa' }}>{round1(totals.p)}g protein</span>
                        <span style={{ color: '#fbbf24' }}>{round1(totals.c)}g carbs</span>
                        <span style={{ color: '#fb923c' }}>{round1(totals.f)}g fat</span>
                      </>
                    );
                  })()}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleSave}
                  disabled={items.filter(i => i.included).length === 0}
                  style={{
                    flex: 1, background: 'var(--accent)', color: '#fff', border: 'none',
                    padding: '11px 0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14,
                    fontWeight: 600, cursor: 'pointer', opacity: items.filter(i => i.included).length === 0 ? 0.4 : 1,
                  }}
                >
                  Add {items.filter(i => i.included).length} Item{items.filter(i => i.included).length !== 1 ? 's' : ''} to Log
                </button>
                <button
                  onClick={() => { setPhase('capture'); setPreview(null); resetInputs(); }}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                    padding: '11px 16px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Retake
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScanSpinner() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="24" cy="24" r="20" fill="none" stroke="var(--surface2)" strokeWidth="4" />
      <circle cx="24" cy="24" r="20" fill="none" stroke="var(--accent)" strokeWidth="4"
        strokeDasharray="30 100" strokeLinecap="round" transform="rotate(-90 24 24)" />
    </svg>
  );
}
