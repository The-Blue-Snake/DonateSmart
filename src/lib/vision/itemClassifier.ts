import type { TaxonomyCategory } from '@/constants/types';
import taxonomyData from '@/data/taxonomy.json';
import { Blob as ExpoBlob } from 'expo-blob';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_EXAMPLES_PER_CANDIDATE = 4;
const UNCERTAIN_ID = 'uncertain';

const taxonomy = (taxonomyData as TaxonomyCategory[]).filter(
  (category) => category.topLevel !== 'Mature',
);

type GeminiResponse = {
  steps?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
  error?: {
    message?: string;
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
  uncertain: boolean;
};

function getApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY ?? '';
}

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

async function imageUriToDataUrl(
  uri: string,
  signal?: AbortSignal,
): Promise<string> {
  console.log(`Fetching image from ${uri}…`);
  const response = await fetch(uri, { signal });

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
  signal?: AbortSignal,
): Promise<{ response: Response; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortRequest = () => controller.abort(signal?.reason);

  try {
    if (signal?.aborted) {
      abortRequest();
    } else {
      signal?.addEventListener('abort', abortRequest, { once: true });
    }

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const body = await response.text();
    return { response, body };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new Error('Gemini took too long to respond.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}

function parseSelection(content: string): SelectionResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Gemini returned an invalid category selection.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned an invalid category selection.');
  }

  const result = parsed as Record<string, unknown>;

  if (typeof result.categoryId !== 'string' || !result.categoryId.trim()) {
    throw new Error('Gemini did not select a taxonomy category.');
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

function getExampleNames(category: TaxonomyCategory): string[] {
  const children = getChildrenCached(category);
  return [...children]
    .sort((a, b) => {
      const childCountDifference =
        getChildrenCached(b).length - getChildrenCached(a).length;

      return childCountDifference || a.name.localeCompare(b.name);
    })
    .slice(0, MAX_EXAMPLES_PER_CANDIDATE)
    .map((child) => child.name);
}

function formatCandidate(category: TaxonomyCategory): string {
  const examples = getExampleNames(category);

  if (examples.length) {
    return `${category.id}: ${category.name} (e.g. ${examples.join(', ')})`;
  }

  return `${category.id}: ${category.name}`;
}

async function requestGemini(
  imageDataUrl: string,
  systemInstruction: string,
  prompt: string,
  maxOutputTokens: number,
  outputSchema: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ response: Response; body: string }> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(
      'Google AI Studio API key is missing. Add EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY to your environment.',
    );
  }

  const image = /^data:([^;]+);base64,(.+)$/.exec(imageDataUrl);
  if (!image) {
    throw new Error('The image could not be prepared for Gemini.');
  }

  return fetchWithTimeout(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      system_instruction: systemInstruction,
      input: [
        {
          type: 'text',
          text: prompt,
        },
        {
          type: 'image',
          data: image[2],
          mime_type: image[1],
        },
      ],
      generation_config: {
        temperature: 0,
        max_output_tokens: maxOutputTokens,
        thinking_level: 'low',
      },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: outputSchema,
      },
    }),
  }, signal);
}

function getGeminiContent(data: GeminiResponse): string | null {
  const parts = data.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? []);
  const content = parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');

  return content?.trim() || null;
}

async function callGemini(
  imageDataUrl: string,
  candidates: TaxonomyCategory[],
  signal?: AbortSignal,
): Promise<SelectionResult> {
  const candidateText = candidates.map(formatCandidate).join('\n');

  console.log(
    `Sending ${candidates.length} candidate(s) to Gemini:\n${candidateText}`,
  );

  const { response, body } = await requestGemini(
    imageDataUrl,
    `You classify a visible donation item into a Google Product Taxonomy tree.
Choose exactly one category from the candidate list below that clearly and confidently
matches the main physical item in the image. Base your choice on what the item literally
is, not on loosely related activities or contexts it could be used for.

Some candidates list example items in parentheses — these show what belongs one level
deeper in that branch, to help you judge fit. They are illustrative, not exhaustive.

If NONE of the candidates are a good match — the item doesn't belong in any of these
options, or the image is too unclear/ambiguous to tell — respond with "${UNCERTAIN_ID}"
instead of guessing. Do not force a pick just to select something.

Return ONLY valid JSON in this exact shape:
{"reasoning":"a few words on why you picked this category","categoryId":"ID"}
where ID is either one of the candidate IDs below or "${UNCERTAIN_ID}".

Candidate categories:
${candidateText}`,
    'Select the best matching category for the main physical item in this photograph. If none confidently match, say so.',
    200,
    {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        categoryId: { type: 'string' },
      },
      required: ['reasoning', 'categoryId'],
      additionalProperties: false,
    },
    signal,
  );

  if (!response.ok) {
    const details = body;

    console.log(`Gemini request failed with status ${response.status}.`);

    if (response.status === 401 || details.includes('API_KEY_INVALID')) {
      throw new Error('Google AI Studio API key is invalid.');
    }

    if (response.status === 429) {
      throw new Error('Google AI Studio rate limit reached. Please try again in a moment.');
    }

    throw new Error(
      details
        ? `Google AI Studio API error (${response.status}): ${details}`
        : `Google AI Studio API error (${response.status}).`,
    );
  }

  const data = JSON.parse(body) as GeminiResponse;

  if (data.error) {
    const message =
      typeof data.error.message === 'string' && data.error.message.trim()
        ? data.error.message
        : 'Gemini returned an unspecified API error.';

    throw new Error(`Gemini API error: ${message}`);
  }

  const content = getGeminiContent(data);

  if (!content) {
    throw new Error('Gemini returned no usable result.');
  }

  console.log(`Gemini raw response: ${content}`);

  const selection = parseSelection(content);

  if (selection.reasoning) {
    console.log(`Gemini's reasoning: ${selection.reasoning}`);
  }

  if (selection.categoryId === null) {
    console.log('Gemini was uncertain — no candidate confidently matched.');
  } else {
    const picked = candidates.find((candidate) => candidate.id === selection.categoryId);
    console.log(
      `Gemini selected: ${selection.categoryId}${picked ? ` (${picked.name})` : ' (not in candidate list!)'}`,
    );
  }

  return selection;
}

async function walkTree(
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<WalkResult | null> {
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

    if (signal?.aborted) {
      throw new Error('Image classification was cancelled.');
    }

    const { categoryId: selectedId } = await callGemini(
      imageDataUrl,
      candidates,
      signal,
    );

    if (selectedId === null) {
      if (!selectedCategory) {
        console.log('Uncertain at the very first level — no category to fall back to.');
        return null;
      }

      console.log(
        `No confident match among children of "${selectedCategory.name}" at level ${candidates[0].level} — ` +
          `stopping here rather than guessing. This may just mean Google's taxonomy isn't more ` +
          `specific for this item, so keeping "${selectedCategory.name}" as the best match.`,
      );

      return { category: selectedCategory, uncertain: true };
    }

    const nextCategory = candidates.find((category) => category.id === selectedId);
    if (!nextCategory) {
      throw new Error('Gemini selected a category outside the provided options.');
    }

    console.log(`Descending into: ${nextCategory.fullPath}`);
    selectedCategory = nextCategory;
    step += 1;
  }
}

export async function classifyImageAt(
  imageUri: string,
  signal?: AbortSignal,
): Promise<ClassificationResult | null> {
  console.log('=== Starting classification ===');
  console.log('Preparing image for Gemini…');

  const imageDataUrl = await imageUriToDataUrl(imageUri, signal);
  if (signal?.aborted) {
    throw new Error('Image classification was cancelled.');
  }

  const walkResult = await walkTree(imageDataUrl, signal);

  if (!walkResult) {
    console.log('=== Classification complete: no confident category found ===');
    return null;
  }

  if (walkResult.uncertain) {
    console.log(
      `=== Classification complete (needs review): ${walkResult.category.fullPath} ===`,
    );
  } else {
    console.log(`=== Classification complete: ${walkResult.category.fullPath} ===`);
  }

  return {
    category: walkResult.category,
    needsReview: walkResult.uncertain,
  };
}
