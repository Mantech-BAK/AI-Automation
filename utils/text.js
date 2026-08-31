function toTitleCase(value) {
  if (value === null || value === undefined) return value;
  const trimmed = String(value).trim();
  if (!trimmed) return trimmed;
  return trimmed
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

module.exports = { toTitleCase };
