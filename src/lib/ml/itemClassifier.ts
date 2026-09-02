const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-small-2603';

const API_KEY = 'CO4n6PfAJlkeZtfzqZ1h5vLnmguTgupo';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ALTERNATIVES = 3;

const SYSTEM_PROMPT = `
You identify physical items for a donation app.

Identify the MAIN physical object the person is trying to donate.

Rules:
- Only identify objects that are actually visible.
- Ignore the background, room, furniture, people, decorations, and unrelated objects.
- Be as specific as the image allows.
- Prefer "blender" over "kitchen appliance".
- Prefer "mountain bike" over "bicycle" when the type is clearly visible.
- Prefer "office chair" over "chair" when the type is clear.
- Identify a brand or model ONLY when it is genuinely visible and identifiable.
- Never invent details.
- If the exact item cannot be determined, use the most useful general description.
- The answer should describe the physical item itself, not what it might be used for.
- If there is no clearly identifiable main item, say "unknown".

Return ONLY valid JSON:

{
  "item": "most likely item",
  "description": "brief description of the visible item",
  "alternatives": [
    "plausible alternative",
    "plausible alternative"
  ]
}

Only include genuinely plausible alternatives.
Return an empty alternatives array when there are no meaningful alternatives.
`.trim();

export type ClassificationPrediction = {
  label: string;
  description?: string;
};

type MistralResult = {
  item: string;
  description?: string;
  alternatives?: string[];
};

type MistralResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Unable to read captured image (${response.status}).`);
  }

  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to convert image to base64.'));
        return;
      }

      const result = reader.result;

      if (result.startsWith('data:')) {
        resolve(result);
        return;
      }

      resolve(`data:${getMimeType(uri)};base64,${result}`);
    };

    reader.onerror = () => {
      reject(new Error('Unable to read captured image.'));
    };

    reader.readAsDataURL(blob);
  });
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

function parseMistralResult(content: string): MistralResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Mistral returned an invalid response.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Mistral returned an invalid response.');
  }

  const result = parsed as Record<string, unknown>;

  if (typeof result.item !== 'string' || !result.item.trim()) {
    throw new Error('Mistral could not identify the item.');
  }

  const description =
    typeof result.description === 'string'
      ? result.description.trim()
      : '';

  const alternatives = Array.isArray(result.alternatives)
    ? result.alternatives
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
        .map((value) => value.trim())
        .filter(
          (value, index, array) =>
            array.findIndex(
              (other) => other.toLowerCase() === value.toLowerCase(),
            ) === index,
        )
        .slice(0, MAX_ALTERNATIVES)
    : [];

  return {
    item: result.item.trim(),
    description,
    alternatives,
  };
}

async function callMistral(
  imageDataUrl: string,
): Promise<MistralResult> {
  if (!API_KEY) {
    throw new Error('Mistral API key is missing.');
  }

  const response = await fetchWithTimeout(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      temperature: 0,
      max_tokens: 300,

      response_format: {
        type: 'json_object',
      },

      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identify the main physical item in this photograph.',
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

    if (response.status === 401) {
      throw new Error('Mistral API key is invalid.');
    }

    if (response.status === 429) {
      throw new Error(
        'Mistral rate limit reached. Please try again in a moment.',
      );
    }

    throw new Error(
      details
        ? `Mistral API error (${response.status}): ${details}`
        : `Mistral API error (${response.status}).`,
    );
  }

  const data = (await response.json()) as MistralResponse;

  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Mistral returned no usable result.');
  }

  return parseMistralResult(content);
}

export async function classifyImageAt(
  imageUri: string,
): Promise<ClassificationPrediction[]> {
  console.log('Preparing image for Mistral…');

  const imageDataUrl = await imageUriToDataUrl(imageUri);

  console.log('Sending image to Mistral…');

  const result = await callMistral(imageDataUrl);

  console.log('Mistral item:', result.item);
  console.log('Mistral description:', result.description);
  console.log('Mistral alternatives:', result.alternatives);

  const predictions: ClassificationPrediction[] = [];

  if (result.item.toLowerCase() !== 'unknown') {
    predictions.push({
      label: result.item,
      description: result.description,
    });
  }

  for (const alternative of result.alternatives ?? []) {
    if (
      !predictions.some(
        (prediction) =>
          prediction.label.toLowerCase() === alternative.toLowerCase(),
      )
    ) {
      predictions.push({
        label: alternative,
      });
    }
  }

  console.log(
    'Mistral predictions:',
    predictions.map((prediction) => prediction.label),
  );

  return predictions;
}