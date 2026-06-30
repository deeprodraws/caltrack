import { useState, useEffect } from 'react';
import { getGoals, updateGoals } from '../api';

export default function Settings() {
  const [form, setForm] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGoals().then(g => {
      setForm({ calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    await updateGoals({
      calories: Number(form.calories),
      protein: Number(form.protein),
      carbs: Number(form.carbs),
      fat: Number(form.fat),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-title">Settings</div>

      <div className="card">
        <div className="settings-section">
          <h3>Daily Goals</h3>
          <p>Set your daily nutrition targets. These are used to calculate your progress on the dashboard.</p>

          <form onSubmit={handleSubmit}>
            <div className="settings-grid">
              {[
                { key: 'calories', label: 'Calories (kcal)', color: '#6c63ff', min: 500, max: 10000 },
                { key: 'protein', label: 'Protein (g)', color: '#60a5fa', min: 0, max: 500 },
                { key: 'carbs', label: 'Carbohydrates (g)', color: '#fbbf24', min: 0, max: 1000 },
                { key: 'fat', label: 'Fat (g)', color: '#fb923c', min: 0, max: 500 },
              ].map(({ key, label, color, min, max }) => (
                <div key={key} className="settings-field">
                  <label style={{ color }}>{label}</label>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    required
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginTop: 20 }}>
              <button className="btn-save" type="submit">Save Goals</button>
              {saved && (
                <span className="toast">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </form>
        </div>

        <hr style={{ borderColor: 'var(--border)', margin: '24px 0' }} />

        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text)' }}>Macro breakdown tips:</strong></p>
          <p>A common starting point: 40% carbs · 30% protein · 30% fat of total calories.</p>
          <p style={{ marginTop: 4 }}>At 2000 kcal: ~200g carbs · 150g protein · 67g fat.</p>
        </div>
      </div>
    </div>
  );
}
