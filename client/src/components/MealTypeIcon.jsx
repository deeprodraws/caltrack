const PATHS = {
  breakfast: (
    <>
      <path d="M12 2v4"/><path d="M4.93 10.93l1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/>
      <path d="M19.07 10.93l-1.41 1.41"/><path d="M22 22H2"/><path d="M8 6l4-4 4 4"/>
      <path d="M16 18a4 4 0 0 0-8 0"/>
    </>
  ),
  lunch: (
    <>
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </>
  ),
  dinner: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  snacks: (
    <>
      <path d="M12 6c-1-1.5-3-2-4.5-1S5 8 5 10.5C5 15 8 20 12 20s7-5 7-9.5c0-2.5-1-4.5-2.5-5.5S13 4.5 12 6z"/>
      <path d="M12 6V3"/><path d="M10 3c1 0 2 .5 2 1.5"/>
    </>
  ),
};

// Small line-icon stand-in for the sunrise/sun/moon/apple emoji meal-type set used across
// FoodLog, Timeline, the Library picker, and Meals.jsx.
export default function MealTypeIcon({ type, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {PATHS[type] || PATHS.snacks}
    </svg>
  );
}
