const { sanitizeSlug, sanitizeText } = require('../shared/validation');

function slugifyGameSignal(value, fallback = 'game-signal') {
  const source = sanitizeText(value, 140) || fallback;
  const slug = sanitizeSlug(source, 96);
  return slug || fallback;
}

function uniqueSlug(baseSlug, exists) {
  const base = slugifyGameSignal(baseSlug);
  let slug = base;
  let index = 2;

  while (exists(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

module.exports = {
  slugifyGameSignal,
  uniqueSlug
};
