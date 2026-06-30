import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const OFF_FACTS_API = 'https://world.openfoodfacts.org/api/v2/product';

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
];

function NutritionInput({ label, value, onChange, color, unit = 'g' }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        {label} <span style={{ fontSize: 10 }}>({unit})</span>
      </div>
      <input
        type="number" min="0" step="0.1"
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

export default function BarcodeScanner({ date, onSave, onClose }) {
  const [phase, setPhase] = useState('scanning');
  const [scanKey, setScanKey] = useState(0);
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState(null);
  const [nutrition, setNutrition] = useState({
    name: '', calories: '', protein: '', carbs: '', fat: '', servingSize: '', servingUnit: 'g',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const qrCodeRef = useRef(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let html5QrCode = null;
    hasScannedRef.current = false;

    const startScanning = async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (cancelled) return;

      try {
        const element = document.getElementById('barcode-scanner');
        if (!element) {
          setError('Scanner element not found');
          setPhase('error');
          return;
        }

        html5QrCode = new Html5Qrcode('barcode-scanner');
        qrCodeRef.current = html5QrCode;

        const handleSuccess = async (decodedText) => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;

          // Stop scanner immediately so it doesn't keep firing
          try {
            await html5QrCode.stop();
            qrCodeRef.current = null;
          } catch {}

          setBarcode(decodedText);
          lookupProduct(decodedText);
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            // No qrbox — scans the full frame so quiet zones aren't clipped
            // and the user can hold the camera at whatever distance is in focus
            formatsToSupport: BARCODE_FORMATS,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
            },
          },
          handleSuccess,
          () => {}
        );
      } catch (err) {
        if (cancelled) return;
        const msg = err?.message || String(err);
        if (msg.includes('Permission') || msg.includes('permission')) {
          setError('Camera permission denied. Please enable camera access in your browser settings.');
        } else if (msg.includes('not found') || msg.includes('NotFound')) {
          setError('Camera not found on this device.');
        } else {
          setError(`Camera error: ${msg}`);
        }
        setPhase('error');
      }
    };

    startScanning().catch(err => {
      if (!cancelled) {
        setError(`Unexpected error: ${err?.message || String(err)}`);
        setPhase('error');
      }
    });

    return () => {
      cancelled = true;
      if (qrCodeRef.current) {
        qrCodeRef.current.stop().catch(() => {});
        qrCodeRef.current = null;
      }
    };
  }, [scanKey]);

  async function lookupProduct(code) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${OFF_FACTS_API}/${code}.json`);

      if (!response.ok) {
        setPhase('notfound');
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.status === 0 || !data.product) {
        setPhase('notfound');
        setLoading(false);
        return;
      }

      const p = data.product;
      setProduct(p);

      const n = p.nutriments || {};

      // Open Food Facts uses hyphenated keys like "energy-kcal_100g"
      const caloriesRaw =
        n['energy-kcal_100g'] ?? n.energy_kcal_100g ??
        (n['energy-kj_100g'] != null ? n['energy-kj_100g'] / 4.184 :
         n.energy_100g != null ? n.energy_100g / 4.184 : null);

      const servingMatch = p.serving_size?.match(/[\d.]+/);

      setNutrition({
        name: p.product_name || `Product #${code}`,
        calories: caloriesRaw != null ? String(Math.round(caloriesRaw)) : '',
        protein: n.proteins_100g != null ? String(Math.round(n.proteins_100g * 10) / 10) : '',
        carbs: n.carbohydrates_100g != null ? String(Math.round(n.carbohydrates_100g * 10) / 10) : '',
        fat: n.fat_100g != null ? String(Math.round(n.fat_100g * 10) / 10) : '',
        servingSize: servingMatch ? servingMatch[0] : '',
        servingUnit: p.serving_size ? p.serving_size.replace(/[\d.]+/g, '').trim() || 'g' : 'g',
      });

      setPhase('found');
      setLoading(false);
    } catch (err) {
      setError(`Network error: ${err.message}`);
      setPhase('error');
      setLoading(false);
    }
  }

  function handleSave() {
    onSave({
      date,
      food_name: nutrition.name || `Product #${barcode}`,
      calories: Number(nutrition.calories) || 0,
      protein: Number(nutrition.protein) || 0,
      carbs: Number(nutrition.carbs) || 0,
      fat: Number(nutrition.fat) || 0,
    });
  }

  function handleRetry() {
    setPhase('scanning');
    setProduct(null);
    setNutrition({ name: '', calories: '', protein: '', carbs: '', fat: '', servingSize: '', servingUnit: 'g' });
    setBarcode('');
    setError('');
    setLoading(false);
    setScanKey(k => k + 1);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px', borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h3 style={{ fontWeight: 600, marginBottom: 2 }}>
              {phase === 'scanning' && '📷 Scan Barcode'}
              {phase === 'found' && '✅ Product Found'}
              {phase === 'notfound' && '⚠️ Product Not Found'}
              {phase === 'error' && '❌ Error'}
            </h3>
            {phase === 'scanning' && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Aim at barcode · the whole frame is scanned
              </p>
            )}
            {phase === 'found' && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Edit any values before saving
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 24 }}>

          {/* Scanning phase */}
          {phase === 'scanning' && (
            <div>
              {/* Scanner with aim-guide overlay */}
              <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', background: '#000', marginBottom: 16 }}>
                <div id="barcode-scanner" style={{ width: '100%' }} />
                {/* Visual aim guide — cosmetic only, full frame is scanned */}
                {!loading && (
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: '75%', height: '35%', position: 'relative',
                    }}>
                      {/* Corner brackets */}
                      {[
                        { top: 0, left: 0, borderTop: '3px solid #fff', borderLeft: '3px solid #fff', borderRadius: '4px 0 0 0' },
                        { top: 0, right: 0, borderTop: '3px solid #fff', borderRight: '3px solid #fff', borderRadius: '0 4px 0 0' },
                        { bottom: 0, left: 0, borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', borderRadius: '0 0 0 4px' },
                        { bottom: 0, right: 0, borderBottom: '3px solid #fff', borderRight: '3px solid #fff', borderRadius: '0 0 4px 0' },
                      ].map((s, i) => (
                        <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
                      ))}
                      {/* Scan line animation */}
                      <div style={{
                        position: 'absolute', left: 0, right: 0, height: 2,
                        background: 'rgba(108,99,255,0.8)',
                        animation: 'scanline 1.8s ease-in-out infinite',
                        top: '50%',
                      }} />
                    </div>
                    <style>{`
                      @keyframes scanline {
                        0%, 100% { transform: translateY(-120%); opacity: 0.6; }
                        50% { transform: translateY(120%); opacity: 1; }
                      }
                    `}</style>
                  </div>
                )}
              </div>
              {loading && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <ScanSpinner />
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 12 }}>
                    Looking up product…
                  </p>
                </div>
              )}
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                Hold barcode inside the box · move back until it's in focus
              </div>
            </div>
          )}

          {/* Product found */}
          {phase === 'found' && (
            <div>
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 16px', marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {product?.image_front_url && (
                    <img
                      src={product.image_front_url}
                      alt={product.product_name}
                      style={{ width: 80, height: 100, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{nutrition.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Barcode: {barcode}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Values below are per 100g — adjust as needed
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
                  Nutrition per 100g
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <NutritionInput label="Calories" value={nutrition.calories} onChange={v => setNutrition(n => ({ ...n, calories: v }))} color="#6c63ff" unit="kcal" />
                  <NutritionInput label="Protein" value={nutrition.protein} onChange={v => setNutrition(n => ({ ...n, protein: v }))} color="#60a5fa" />
                  <NutritionInput label="Carbs" value={nutrition.carbs} onChange={v => setNutrition(n => ({ ...n, carbs: v }))} color="#fbbf24" />
                  <NutritionInput label="Fat" value={nutrition.fat} onChange={v => setNutrition(n => ({ ...n, fat: v }))} color="#fb923c" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1, background: 'var(--accent)', color: '#fff', border: 'none',
                    padding: '11px 0', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Add to Log
                </button>
                <button
                  onClick={handleRetry}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                    padding: '11px 16px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Scan Another
                </button>
              </div>
            </div>
          )}

          {/* Product not found */}
          {phase === 'notfound' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Product Not Found</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                Barcode <strong style={{ color: 'var(--text)' }}>{barcode}</strong> isn't in the Open Food Facts database.
                You can enter the nutrition manually in the food log.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={handleRetry}
                  style={{
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    padding: '9px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Try Another Barcode
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                    padding: '9px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div style={{
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 10, padding: '14px 18px', marginBottom: 20, textAlign: 'left',
              }}>
                <div style={{ color: '#f87171', fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Error</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={handleRetry}
                  style={{
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    padding: '9px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                    padding: '9px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancel
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
