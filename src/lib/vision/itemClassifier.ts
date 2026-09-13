import type { TaxonomyCategory } from '@/constants/types';
import taxonomyData from '@/data/taxonomy.json';
import { Blob as ExpoBlob } from 'expo-blob';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-small-2603';

const API_KEY = 'iGYIx1ZnxJWDoRzz0z2GhFCEUJjr13zJ';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_EXAMPLES_PER_CANDIDATE = 4;

const taxonomy = taxonomyData as TaxonomyCategory[];

const UNCERTAIN_ID = 'uncertain';

type MistralResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export type ClassificationResult = {
  category: TaxonomyCategory;
  needsReview: boolean;
};

type SelectionResult = {
  categoryId: string | null;
  reasoning: string | null;
};

type WalkResult = {
  category: TaxonomyCategory;
  // True when the walk stopped early because Mistral had no confident pick
  // among the children at some level, rather than reaching a true leaf.
  uncertain: boolean;
};

function getMimeType(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'png':
      return 'image/png';

    case 'webp':
      return 'image/webp';

    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

async function imageUriToDataUrl(uri: string): Promise<string> {
  console.log(`Fetching image from ${uri}…`);
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Unable to read captured image (${response.status}).`);
  }

  const blob = new ExpoBlob([await response.arrayBuffer()], {
    type: getMimeType(uri),
  });
  console.log(
    `Image fetched (${blob.size} bytes, ${blob.type || 'unknown type'}). Encoding to base64…`,
  );

  const bytes = await blob.bytes();
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  try {
    return `data:${getMimeType(uri)};base64,${globalThis.btoa(binary)}`;
  } catch {
    throw new Error('Unable to convert image to base64.');
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Mistral took too long to respond.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Returns the selected category id (or null if uncertain) plus Mistral's
// stated reasoning, for logging/debugging purposes.
function parseSelection(content: string): SelectionResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Mistral returned an invalid category selection.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Mistral returned an invalid category selection.');
  }

  const result = parsed as Record<string, unknown>;

  if (typeof result.categoryId !== 'string' || !result.categoryId.trim()) {
    throw new Error('Mistral did not select a taxonomy category.');
  }

  const categoryId = result.categoryId.trim();
  const reasoning =
    typeof result.reasoning === 'string' && result.reasoning.trim()
      ? result.reasoning.trim()
      : null;

  return {
    categoryId: categoryId === UNCERTAIN_ID ? null : categoryId,
    reasoning,
  };
}

function parseConfirmation(content: string): boolean {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Mistral returned an invalid verification response.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Mistral returned an invalid verification response.');
  }

  const result = parsed as Record<string, unknown>;

  return result.confirmed === true;
}

function getChildren(category: TaxonomyCategory | null): TaxonomyCategory[] {
  const parentPath = category ? category.fullPath : '';
  const parentLevel = category ? category.level : 0;

  return taxonomy.filter(
    (candidate) =>
      candidate.level === parentLevel + 1 &&
      (parentLevel === 0 ||
        candidate.fullPath.startsWith(`${parentPath} > `)) &&
      candidate.fullPath.split(' > ').length === parentLevel + 1,
  );
}

// Cache of category id -> its children, computed once, since formatCandidate
// calls getChildren for every candidate at every step (to build examples).
const childrenCache = new Map<string, TaxonomyCategory[]>();

function getChildrenCached(category: TaxonomyCategory): TaxonomyCategory[] {
  const cached = childrenCache.get(category.id);

  if (cached) {
    return cached;
  }

  const children = getChildren(category);
  childrenCache.set(category.id, children);

  return children;
}

// Uses the next level of the tree as free "example" data for a candidate —
// e.g. when showing "Indoor Games" as an option, its examples are its own
// children ("Air Hockey", "Billiards", "Bowling", ...). Leaf categories with
// no children simply show no examples.
function getExampleNames(category: TaxonomyCategory): string[] {
  const children = getChildrenCached(category);

  return children.slice(0, MAX_EXAMPLES_PER_CANDIDATE).map((c) => c.name);
}

function formatCandidate(category: TaxonomyCategory): string {
  const examples = getExampleNames(category);

  if (examples.length) {
    return `${category.id}: ${category.name} (e.g. ${examples.join(', ')})`;
  }

  return `${category.id}: ${category.name}`;
}

async function callMistral(
  imageDataUrl: string,
  candidates: TaxonomyCategory[],
): Promise<SelectionResult> {
  if (!API_KEY) {
    throw new Error('Mistral API key is missing.');
  }

  const candidateText = candidates.map(formatCandidate).join('\n');

  console.log(
    `Sending ${candidates.length} candidate(s) to Mistral:\n${candidateText}`,
  );

  const response = await fetchWithTimeout(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      temperature: 0,
      max_tokens: 200,

      response_format: {
        type: 'json_object',
      },

      messages: [
        {
          role: 'system',
          content: `You classify a visible donation item into a Google Product Taxonomy tree.
Choose exactly one category from the candidate list below that clearly and confidently
matches the main physical item in the image. Base your choice on what the item literally
is, not on loosely related activities or contexts it could be used in (for example, a game
controller is an electronics accessory, not a sporting good, even though it's used for games).

Some candidates list example items in parentheses — these show what belongs one level
deeper in that branch, to help you judge fit. They are illustrative, not exhaustive.

If NONE of the candidates are a good match — the item doesn't belong in any of these
options, or the image is too unclear/ambiguous to tell — respond with "${UNCERTAIN_ID}"
instead of guessing. Do not force a pick just to select something.

Return ONLY valid JSON in this exact shape:
{"reasoning":"one or two sentences on what you see and why you picked this category","categoryId":"ID"}
where ID is either one of the candidate IDs below or "${UNCERTAIN_ID}".

Candidate categories:
${candidateText}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Select the best matching category for the main physical item in this photograph. If none confidently match, say so.',
            },
            {
              type: 'image_url',
              image_url: imageDataUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    let details = '';

    try {
      details = await response.text();
    } catch {
      // Ignore failure to read the error body.
    }

    console.log(`Mistral request failed with status ${response.status}.`);

    if (response.status === 401) {
  throw new Error('Mistral API key is invalid.');
}

if (response.status === 429) {
  throw new Error('Mistral rate limit reached. Please try again in a moment.');
}

if (!response.ok) {
  throw new Error(
    details
      ? `Mistral API error (${response.status}): ${details}`
      : `Mistral API error (${response.status}).`,
  );
}
  }

  const data = (await response.json()) as MistralResponse;

  if (data.error) {
    const message =
      typeof data.error.message === 'string' && data.error.message.trim()
        ? data.error.message
        : 'Mistral returned an unspecified API error.';

    throw new Error(`Mistral API error: ${message}`);
  }

  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      'Mistral returned no usable result. The response did not contain choices[0].message.content.',
    );
  }

  console.log(`Mistral raw response: ${content.trim()}`);

  const selection = parseSelection(content);

  if (selection.reasoning) {
    console.log(`Mistral's reasoning: ${selection.reasoning}`);
  }

  if (selection.categoryId === null) {
    console.log('Mistral was uncertain — no candidate confidently matched.');
  } else {
    const picked = candidates.find((c) => c.id === selection.categoryId);
    console.log(
      `Mistral selected: ${selection.categoryId}${picked ? ` (${picked.name})` : ' (not in candidate list!)'}`,
    );
  }

  return selection;
}

async function verifyFinalCategory(
  imageDataUrl: string,
  category: TaxonomyCategory,
): Promise<boolean> {
  if (!API_KEY) {
    throw new Error('Mistral API key is missing.');
  }

  console.log(`Verifying final category: ${category.fullPath}`);

  const response = await fetchWithTimeout(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      temperature: 0,
      max_tokens: 150,

      response_format: {
        type: 'json_object',
      },

      messages: [
        {
          role: 'system',
          content: `You are double-checking a product classification.
Given a photo and a proposed taxonomy path, decide whether the path genuinely and
literally describes the main physical item in the photo — not something loosely
associated with it. The path may stop short of maximum specificity if Google's
taxonomy simply doesn't go any deeper for that kind of item — that's still a valid
confirmation as long as the path itself is correct.

Return ONLY valid JSON in this exact shape:
{"reasoning":"one sentence on whether the path fits","confirmed":true|false}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Proposed category path: "${category.fullPath}". Does this correctly describe the main physical item in the image?`,
            },
            {
              type: 'image_url',
              image_url: imageDataUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.log(
      `Verification call failed with status ${response.status}, treating as unconfirmed.`,
    );
    return false;
  }

  const data = (await response.json()) as MistralResponse;
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    console.log('Verification returned no usable content, treating as unconfirmed.');
    return false;
  }

  console.log(`Verification raw response: ${content.trim()}`);

  const confirmed = parseConfirmation(content);
  console.log(confirmed ? 'Verification: confirmed.' : 'Verification: rejected.');

  return confirmed;
}

// Walks the taxonomy tree from the root, one call per level.
//
// Returns null only when Mistral is uncertain at the very first level —
// there's nothing to fall back to in that case.
//
// If Mistral becomes uncertain partway down (no child confidently matches),
// the walk stops and returns the last confident category with
// `uncertain: true`, rather than discarding it — that category may still be
// correct, it's just that Google's taxonomy doesn't go any more specific for
// this particular item. The caller verifies it before trusting it.
async function walkTree(imageDataUrl: string): Promise<WalkResult | null> {
  let selectedCategory: TaxonomyCategory | null = null;
  let step = 1;

  while (true) {
    const candidates: TaxonomyCategory[] = selectedCategory
  ? getChildrenCached(selectedCategory)
  : getChildren(null);

    if (!candidates.length) {
      if (!selectedCategory) {
        throw new Error('The taxonomy has no selectable categories.');
      }

      console.log(
        `Reached a leaf category with no children: ${selectedCategory.name}. Done.`,
      );

      return { category: selectedCategory, uncertain: false };
    }

    console.log(
      `--- Step ${step}: selecting among ${candidates.length} option(s) at level ${candidates[0].level} ---`,
    );

    const { categoryId: selectedId } = await callMistral(imageDataUrl, candidates);

    if (selectedId === null) {
      if (!selectedCategory) {
        console.log('Uncertain at the very first level — no category to fall back to.');
        return null;
      }

      console.log(
        `No confident match among children of "${selectedCategory.name}" at level ${candidates[0].level} — ` +
          `stopping here rather than guessing. This may just mean Google's taxonomy isn't more ` +
          `specific for this item, so "${selectedCategory.name}" will be verified as-is.`,
      );

      return { category: selectedCategory, uncertain: true };
    }

    const nextCategory = candidates.find((category) => category.id === selectedId);

    if (!nextCategory) {
      throw new Error('Mistral selected a category outside the provided options.');
    }

    console.log(`Descending into: ${nextCategory.fullPath}`);
    selectedCategory = nextCategory;
    step += 1;
  }
}

// Classifies the item in the photo into the taxonomy.
//
// Walks the tree exactly once, then runs a single cheap verification pass
// on whatever it lands on. Returns null (no retry) if either the walk never
// got a confident category at all, or verification rejects the final pick —
// in both cases the caller should present "no category found" rather than a
// guessed result.
export async function classifyImageAt(
  imageUri: string,
): Promise<ClassificationResult | null> {
  console.log('=== Starting classification ===');
  console.log('Preparing image for Mistral…');

  const imageDataUrl = await imageUriToDataUrl(imageUri);

  const walkResult = await walkTree(imageDataUrl);

  if (!walkResult) {
    console.log('=== Classification complete: no confident category found ===');
    return null;
  }

  const confirmed = await verifyFinalCategory(imageDataUrl, walkResult.category);

  if (!confirmed) {
    console.log(
      `Verification rejected "${walkResult.category.fullPath}" — reporting no category found.`,
    );
    console.log('=== Classification complete: no category found ===');
    return null;
  }

  if (walkResult.uncertain) {
    console.log(
      `=== Classification complete (needs review): ${walkResult.category.fullPath} ===`,
    );
  } else {
    console.log(`=== Classification complete: ${walkResult.category.fullPath} ===`);
  }

  return { category: walkResult.category, needsReview: walkResult.uncertain };
}