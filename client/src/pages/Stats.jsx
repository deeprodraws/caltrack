import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { getEntriesRange, getGoals, getWeightLogs } from '../api';

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

function convertWeight(weight, from, to) {
  if (from === to) return +weight.toFixed(1);
  if (from === 'kg') return +(weight * KG_TO_LBS).toFixed(1);
  return +(weight * LBS_TO_KG).toFixed(1);
}

function getRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function fillDates(start, end) {
  const out = [];
  const cur = new Date(start + 'T12:00:00');
  const fin = new Date(end + 'T12:00:00');
  while (cur <= fin) { out.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  return out;
}

function shortLabel(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function PillBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 99, border: '1px solid', fontSize: 12,
      fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
      background: active ? '#6c63ff' : 'transparent',
      borderColor: active ? '#6c63ff' : '#2e3250',
      color: active ? '#fff' : '#7c82a0',
    }}>{label}</button>
  );
}

function EmptyChart({ message }) {
  return (
    <div style={{
      height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#22263a', borderRadius: 10, color: '#7c82a0', fontSize: 14, textAlign: 'center',
      padding: '0 24px',
    }}>{message}</div>
  );
}

export default function Stats() {
  const [period, setPeriod] = useState(7);
  const [weightPeriod, setWeightPeriod] = useState(30);
  const [allEntries, setAllEntries] = useState([]);
  const [goals, setGoals] = useState({ calories: 2000, protein: 150, carbs: 250, fat: 65, weight_unit: 'kg' });
  const [weightLogs, setWeightLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const unit = goals.weight_unit || 'kg';

  useEffect(() => {
    const { start, end } = getRange(30);
    Promise.all([getEntriesRange(start, end), getGoals(), getWeightLogs()])
      .then(([e, g, w]) => { setAllEntries(e); setGoals(g); setWeightLogs(w); setLoading(false); });
  }, []);

  // ── Calorie + macro data ────────────────────────────────────────────────────
  const { calorieData, macroAvg, calAvg, daysLogged } = useMemo(() => {
    const { start, end } = getRange(period);
    const byDate = {};
    allEntries.forEach(e => {
      if (e.date < start || e.date > end) return;
      if (!byDate[e.date]) byDate[e.date] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      byDate[e.date].calories += e.calories;
      byDate[e.date].protein  += e.protein;
      byDate[e.date].carbs    += e.carbs;
      byDate[e.date].fat      += e.fat;
    });
    const days = Object.values(byDate);
    const n = days.length;
    const avg = (key) => n ? +(days.reduce((s, d) => s + d[key], 0) / n).toFixed(1) : 0;

    return {
      calorieData: fillDates(start, end).map(d => ({
        date: shortLabel(d),
        calories: byDate[d] ? Math.round(byDate[d].calories) : null,
      })),
      macroAvg: { protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') },
      calAvg: n ? Math.round(days.reduce((s, d) => s + d.calories, 0) / n) : 0,
      daysLogged: n,
    };
  }, [allEntries, period]);

  // ── Weight data ─────────────────────────────────────────────────────────────
  const { weightData, weightSummary } = useMemo(() => {
    let logs = [...weightLogs].reverse(); // oldest → newest
    if (weightPeriod > 0) {
      const { start } = getRange(weightPeriod);
      logs = logs.filter(w => w.date >= start);
    }
    const weightData = logs.map(w => ({
      date: shortLabel(w.date),
      weight: convertWeight(w.weight, w.unit, unit),
    }));
    const first = weightData[0]?.weight;
    const last  = weightData[weightData.length - 1]?.weight;
    const change = first != null && last != null && weightData.length > 1
      ? +(last - first).toFixed(1) : null;
    return { weightData, weightSummary: { current: last, change } };
  }, [weightLogs, weightPeriod, unit]);

  if (loading) return <div className="empty-state">Loading…</div>;

  const calTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || payload[0].value == null) return null;
    return (
      <div style={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
        <div style={{ color: '#7c82a0', marginBottom: 3 }}>{label}</div>
        <div style={{ color: '#6c63ff', fontWeight: 600 }}>{Math.round(payload[0].value).toLocaleString()} kcal</div>
      </div>
    );
  };

  const weightTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || payload[0].value == null) return null;
    return (
      <div style={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
        <div style={{ color: '#7c82a0', marginBottom: 3 }}>{label}</div>
        <div style={{ color: '#60a5fa', fontWeight: 600 }}>{payload[0].value} {unit}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-title">Statistics</div>

      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <PillBtn label="7 Days" active={period === 7} onClick={() => setPeriod(7)} />
        <PillBtn label="30 Days" active={period === 30} onClick={() => setPeriod(30)} />
      </div>

      {/* ── Calories ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#7c82a0', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Calories</div>
        {daysLogged > 0 ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#6c63ff' }}>{calAvg.toLocaleString()}</span>
            <span style={{ fontSize: 13, color: '#7c82a0' }}>avg kcal/day · {daysLogged}/{period} days logged</span>
          </div>
        ) : (
          <p style={{ color: '#7c82a0', fontSize: 14, marginBottom: 12 }}>No food logged in this period.</p>
        )}

        {daysLogged < 2 ? (
          <EmptyChart message="Log food on at least 2 days to see a trend" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={calorieData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#7c82a0', fontSize: 10 }} tickLine={false} axisLine={false} interval={period === 7 ? 0 : 4} />
                <YAxis tick={{ fill: '#7c82a0', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                <Tooltip content={calTooltip} />
                <ReferenceLine y={goals.calories} stroke="#34d399" strokeDasharray="4 3" strokeWidth={1.5} />
                <Line type="monotone" dataKey="calories" stroke="#6c63ff" strokeWidth={2}
                  dot={{ fill: '#6c63ff', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 6, fontSize: 11, color: '#7c82a0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 20, borderTop: '2px dashed #34d399' }} />
              Goal: {goals.calories.toLocaleString()} kcal
            </div>
          </>
        )}
      </div>

      {/* ── Macros ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#7c82a0', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>
          Avg Daily Macros · {period} days
        </div>
        {daysLogged === 0 ? (
          <p style={{ color: '#7c82a0', fontSize: 14 }}>No data for this period.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Protein', val: macroAvg.protein, goal: goals.protein, color: '#60a5fa' },
              { label: 'Carbs',   val: macroAvg.carbs,   goal: goals.carbs,   color: '#fbbf24' },
              { label: 'Fat',     val: macroAvg.fat,     goal: goals.fat,     color: '#fb923c' },
            ].map(({ label, val, goal, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#7c82a0' }}>
                    <strong style={{ color }}>{val}g</strong> / {goal}g
                  </span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-bar" style={{ width: `${Math.min((val / goal) * 100, 100)}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Weight ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#7c82a0', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Weight</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <PillBtn label="30 Days" active={weightPeriod === 30} onClick={() => setWeightPeriod(30)} />
            <PillBtn label="All Time" active={weightPeriod === 0} onClick={() => setWeightPeriod(0)} />
          </div>
        </div>

        {weightSummary.current != null && (
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#7c82a0', letterSpacing: '0.5px', marginBottom: 2 }}>CURRENT</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {weightSummary.current} <span style={{ fontSize: 14, fontWeight: 400, color: '#7c82a0' }}>{unit}</span>
              </div>
            </div>
            {weightSummary.change != null && (
              <div>
                <div style={{ fontSize: 11, color: '#7c82a0', letterSpacing: '0.5px', marginBottom: 2 }}>CHANGE</div>
                <div style={{ fontSize: 24, fontWeight: 700,
                  color: weightSummary.change < 0 ? '#34d399' : weightSummary.change > 0 ? '#f87171' : '#7c82a0' }}>
                  {weightSummary.change > 0 ? '+' : ''}{weightSummary.change} <span style={{ fontSize: 14, fontWeight: 400 }}>{unit}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {weightData.length < 2 ? (
          <EmptyChart message={weightLogs.length === 0
            ? 'No weight logged yet — use the Dashboard to log your weight'
            : 'Log at least 2 weights to see a trend'} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#7c82a0', fontSize: 10 }} tickLine={false} axisLine={false}
                interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#7c82a0', fontSize: 10 }} tickLine={false} axisLine={false}
                domain={['auto', 'auto']} />
              <Tooltip content={weightTooltip} />
              <Line type="monotone" dataKey="weight" stroke="#60a5fa" strokeWidth={2}
                dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
