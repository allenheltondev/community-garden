export const COMPLETENESS_FIELDS = [
  'scientific_name',
  'common_name',
  'family',
  'category',
  'light_requirement',
  'water_requirement',
  'life_cycle',
  'edible_parts',
];

export function validateRecord(requiredKeys, record) {
  const errors = [];
  for (const key of requiredKeys) {
    if (!(key in record)) errors.push(`Missing required key: ${key}`);
  }
  return { valid: errors.length === 0, errors };
}
