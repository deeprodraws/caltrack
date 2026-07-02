export function scaleMacros(food, weightGrams) {
  // food must have macros_per_100g = true and calories/protein/carbs/fat stored per 100g
  const ratio = weightGrams / 100;
  return {
    calories: Math.round(food.calories * ratio * 10) / 10,
    protein:  Math.round(food.protein  * ratio * 10) / 10,
    carbs:    Math.round(food.carbs    * ratio * 10) / 10,
    fat:      Math.round(food.fat      * ratio * 10) / 10,
  };
}

export function buildPortionOptions(food) {
  // Returns array of { label, weight_grams }
  const options = [];
  if (food.macros_per_100g) {
    options.push({ label: '100g', weight_grams: 100 });
  }
  if (food.portions && food.portions.length > 0) {
    options.push(...food.portions.map(p => ({
      label: `${p.label} (${p.weight_grams}g)`,
      weight_grams: p.weight_grams,
    })));
  }
  return options;
}
