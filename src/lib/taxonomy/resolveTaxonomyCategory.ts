import type { TaxonomyCategory } from '@/constants/types';
import taxonomyData from '@/data/taxonomy.json';

const taxonomy = taxonomyData as TaxonomyCategory[];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeToken = (token: string) => {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
};

const getTokens = (value: string) =>
  normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken);

const getNormalizedPhrase = (value: string) => getTokens(value).join(' ');

const getMatchScore = (label: string, category: TaxonomyCategory) => {
  const normalizedLabel = normalizeText(label);
  const normalizedName = normalizeText(category.name);
  const normalizedPath = normalizeText(category.fullPath);
  const normalizedLabelPhrase = getNormalizedPhrase(label);
  const normalizedNamePhrase = getNormalizedPhrase(category.name);

  if (normalizedLabelPhrase === normalizedNamePhrase) {
    return 1_000;
  }

  if (getNormalizedPhrase(category.fullPath) === normalizedLabelPhrase) {
    return 900;
  }

  if (
    normalizedName.includes(normalizedLabel) ||
    normalizedLabel.includes(normalizedName)
  ) {
    return 800 + Math.min(normalizedLabel.length, normalizedName.length);
  }

  const labelTokens = getTokens(label);
  const nameTokens = new Set(getTokens(category.name));
  const matchingTokens = labelTokens.filter((token) => nameTokens.has(token));

  if (!labelTokens.length || matchingTokens.length === 0) {
    return 0;
  }

  const coverage = matchingTokens.length / labelTokens.length;

  // Require most of the label to match so generic words do not select a
  // misleading category from an unrelated branch.
  if (coverage < 0.5) {
    return 0;
  }

  return 500 + coverage * 100 + category.level;
};

export function resolveTaxonomyCategory(
  labels: string[],
): TaxonomyCategory | null {
  let bestMatch: TaxonomyCategory | null = null;
  let bestScore = 0;

  for (const label of labels) {
    if (!label.trim()) {
      continue;
    }

    for (const category of taxonomy) {
      const score = getMatchScore(label, category);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = category;
      }
    }
  }

  return bestMatch;
}
