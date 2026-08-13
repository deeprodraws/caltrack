import { useState } from 'react';
import MyFoods from './MyFoods';
import Meals from './Meals';
import TabBar from '../components/TabBar';

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

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* Saved Foods tab */}
      {tab === 'foods' && <MyFoods embedded />}

      {/* Templates + Recipes: keep Meals mounted so switching between them is instant */}
      <div style={{ display: tab !== 'foods' ? 'block' : 'none' }}>
        <Meals embedded activeTab={tab !== 'foods' ? tab : 'templates'} />
      </div>
    </div>
  );
}
