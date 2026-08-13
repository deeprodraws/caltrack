import { IconSunrise, IconSun, IconMoon, IconApple } from '@tabler/icons-react';

const ICONS = { breakfast: IconSunrise, lunch: IconSun, dinner: IconMoon, snacks: IconApple };

// Small line-icon stand-in for the sunrise/sun/moon/apple emoji meal-type set used across
// FoodLog, Timeline, the Library picker, and Meals.jsx.
export default function MealTypeIcon({ type, size = 14 }) {
  const Icon = ICONS[type] || ICONS.snacks;
  return <Icon size={size} style={{ flexShrink: 0 }} />;
}
