import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEntries, getGoals } from '../api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function sum(entries, key) {
  return entries.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);
}

function clamp(v) {
  return Math.min(v, 100);
}

function CalorieRing({ eaten, goal }) {
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const r = 68;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;
  const color = pct > 1 ? '#f87171' : pct > 0.85 ? '#fbbf24' : '#6c63ff';

  return (
    <div className="calorie-ring-wrap" style={{ width: 160, height: 160 }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#22263a" strokeWidth="14" />
        <circle
          cx="80" cy="80" r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset="0"
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="calorie-center">
        <span className="cal-num" style={{ color }}>{Math.round(eaten)}</span>
        <span className="cal-label">/ {Math.round(goal)} kcal</span>
      </div>
    </div>
  );
}

function MacroBar({ label, current, goal, color }) {
  const pct = goal > 0 ? clamp((current / goal) * 100) : 0;
  return (
    <div className="macro-card">
      <div className="macro-label">{label}</div>
      <div className="macro-values">
        <span className="macro-current" style={{ color }}>{Math.round(current)}</span>
        <span className="macro-goal">/ {goal}g</span>
      </div>
      <div className="progress-wrap">
        <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [entries, setEntries] = useState([]);
  const [goals, setGoals] = useState({ calories: 2000, protein: 150, carbs: 250, fat: 65 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getEntries(todayStr()), getGoals()]).then(([e, g]) => {
      setEntries(e);
      setGoals(g);
      setLoading(false);
    });
  }, []);

  const cals = sum(entries, 'calories');
  const protein = sum(entries, 'protein');
  const carbs = sum(entries, 'carbs');
  const fat = sum(entries, 'fat');
  const remaining = Math.max(goals.calories - cals, 0);

  if (loading) return <div className="empty-state">Loading...</div>;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div>
      <div className="page-title">Dashboard</div>

      <div className="calorie-hero">
        <CalorieRing eaten={cals} goal={goals.calories} />
        <div className="calorie-info">
          <h2>Today's Progress</h2>
          <p style={{ marginBottom: 0 }}>{today}</p>
          <div className="calorie-stats">
            <div className="cal-stat">
              <div className="val" style={{ color: '#6c63ff' }}>{Math.round(cals)}</div>
              <div className="lbl">Eaten</div>
            </div>
            <div className="cal-stat">
              <div className="val" style={{ color: '#34d399' }}>{Math.round(remaining)}</div>
              <div className="lbl">Remaining</div>
            </div>
            <div className="cal-stat">
              <div className="val">{goals.calories}</div>
              <div className="lbl">Goal</div>
            </div>
          </div>
        </div>
      </div>

      <div className="macro-grid">
        <MacroBar label="Protein" current={protein} goal={goals.protein} color="#60a5fa" />
        <MacroBar label="Carbs" current={carbs} goal={goals.carbs} color="#fbbf24" />
        <MacroBar label="Fat" current={fat} goal={goals.fat} color="#fb923c" />
        <MacroBar label="Calories" current={cals} goal={goals.calories} color="#6c63ff" />
      </div>

      <div className="section-header">
        <span className="section-title">Today's Entries</span>
        <Link to="/log" style={{ fontSize: 13, color: 'var(--accent-light)' }}>View all →</Link>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          No food logged today. <Link to="/log" style={{ color: 'var(--accent-light)' }}>Add your first entry →</Link>
        </div>
      ) : (
        <div className="entry-list">
          {entries.slice(0, 5).map(e => (
            <div key={e.id} className="entry-row">
              <span className="entry-name">{e.food_name}</span>
              <div className="entry-macros">
                <div className="entry-macro">
                  <div className="val" style={{ color: '#6c63ff' }}>{Math.round(e.calories)}</div>
                  <div className="lbl">kcal</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#60a5fa' }}>{Math.round(e.protein)}g</div>
                  <div className="lbl">protein</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fbbf24' }}>{Math.round(e.carbs)}g</div>
                  <div className="lbl">carbs</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fb923c' }}>{Math.round(e.fat)}g</div>
                  <div className="lbl">fat</div>
                </div>
              </div>
            </div>
          ))}
          {entries.length > 5 && (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: 'var(--text-muted)' }}>
              +{entries.length - 5} more — <Link to="/log" style={{ color: 'var(--accent-light)' }}>view all</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
