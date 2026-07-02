import { useState, useEffect } from 'react';
import { getGoals, updateGoals, updateProfile, migrateLegacyData } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState({ calories: '', protein: '', carbs: '', fat: '', weight_unit: 'lbs' });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [profileForm, setProfileForm] = useState({ display_name: '', current_password: '', new_password: '' });
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState(null);

  useEffect(() => {
    getGoals().then(g => {
      setForm({
        calories: g.calories,
        protein: g.protein,
        carbs: g.carbs,
        fat: g.fat,
        weight_unit: g.weight_unit || 'lbs',
      });
      setLoading(false);
    });
    if (user) {
      setProfileForm(f => ({ ...f, display_name: user.display_name || '' }));
    }
  }, [user]);

  async function handleGoalsSubmit(e) {
    e.preventDefault();
    await updateGoals({
      calories: Number(form.calories),
      protein: Number(form.protein),
      carbs: Number(form.carbs),
      fat: Number(form.fat),
      weight_unit: form.weight_unit,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      const payload = { display_name: profileForm.display_name };
      if (profileForm.new_password) {
        payload.current_password = profileForm.current_password;
        payload.new_password = profileForm.new_password;
      }
      await updateProfile(payload);
      setProfileMsg({ type: 'ok', text: 'Profile updated' });
      setProfileForm(f => ({ ...f, current_password: '', new_password: '' }));
    } catch (err) {
      setProfileMsg({ type: 'err', text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleMigrate() {
    if (!window.confirm('This will import all existing data into your account. Continue?')) return;
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const result = await migrateLegacyData();
      const total = Object.values(result.migrated).reduce((a, b) => a + b, 0);
      setMigrateMsg({ type: 'ok', text: `Imported ${total} records successfully.` });
    } catch (err) {
      setMigrateMsg({ type: 'err', text: err.message });
    } finally {
      setMigrating(false);
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-title">Settings</div>

      {/* Profile */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={handleProfileSubmit}>
          <div className="settings-section">
            <h3>Profile</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Signed in as <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>
            </p>

            <div className="settings-grid">
              <div className="settings-field">
                <label>Display name</label>
                <input
                  type="text"
                  value={profileForm.display_name}
                  onChange={e => setProfileForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="Your name"
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Change password (leave blank to keep current)</p>
              <div className="settings-grid">
                <div className="settings-field">
                  <label>Current password</label>
                  <input
                    type="password"
                    value={profileForm.current_password}
                    onChange={e => setProfileForm(f => ({ ...f, current_password: e.target.value }))}
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                </div>
                <div className="settings-field">
                  <label>New password</label>
                  <input
                    type="password"
                    value={profileForm.new_password}
                    onChange={e => setProfileForm(f => ({ ...f, new_password: e.target.value }))}
                    autoComplete="new-password"
                    placeholder="Min 6 characters"
                    minLength={profileForm.new_password ? 6 : undefined}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <button className="btn-save" type="submit" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </button>
            {profileMsg && (
              <span style={{ fontSize: 13, color: profileMsg.type === 'ok' ? 'var(--accent)' : '#f87171' }}>
                {profileMsg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Daily Goals */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={handleGoalsSubmit}>
          <div className="settings-section">
            <h3>Daily Goals</h3>
            <p>Set your daily nutrition targets. These are used to calculate your progress on the dashboard.</p>

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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 24 }}>
            <button className="btn-save" type="submit">Save Settings</button>
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

        <hr style={{ borderColor: 'var(--border)', margin: '24px 0' }} />

        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text)' }}>Macro breakdown tips:</strong></p>
          <p>A common starting point: 40% carbs · 30% protein · 30% fat of total calories.</p>
          <p style={{ marginTop: 4 }}>At 2000 kcal: ~200g carbs · 150g protein · 67g fat.</p>
        </div>
      </div>

      {/* Data Migration */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="settings-section">
          <h3>Import Existing Data</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            If CalTrack had data before you created your account, use this to claim it.
            Only works once and only if your account has no data yet.
          </p>
          <button
            className="btn-save"
            type="button"
            onClick={handleMigrate}
            disabled={migrating}
            style={{ background: 'var(--surface2)' }}
          >
            {migrating ? 'Importing…' : 'Import my existing data'}
          </button>
          {migrateMsg && (
            <p style={{ marginTop: 12, fontSize: 13, color: migrateMsg.type === 'ok' ? 'var(--accent)' : '#f87171' }}>
              {migrateMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Sign out */}
      <div className="card">
        <div className="settings-section">
          <h3>Account</h3>
          <button
            className="btn-save"
            type="button"
            onClick={logout}
            style={{ background: '#ef4444', marginTop: 8 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
