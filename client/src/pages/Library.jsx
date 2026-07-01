import { useState } from 'react';
import MyFoods from './MyFoods';
import Meals from './Meals';

const TABS = [
  { key: 'foods',     label: 'Saved Foods' },
  { key: 'templates', label: 'Templates' },
  { key: 'recipes',   label: 'Recipes' },
];

export default function Library() {
  const [tab, setTab] = useState('foods');

  return (
    <div>
      <div className="page-title">Library</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.key ? 'var(--accent-light)' : 'var(--text-muted)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Saved Foods tab */}
      {tab === 'foods' && <MyFoods embedded />}

      {/* Templates + Recipes: keep Meals mounted so switching between them is instant */}
      <div style={{ display: tab !== 'foods' ? 'block' : 'none' }}>
        <Meals embedded activeTab={tab !== 'foods' ? tab : 'templates'} />
      </div>
    </div>
  );
}
