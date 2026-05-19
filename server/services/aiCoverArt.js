function safeText(value, fallback = '') {
  return String(value || fallback || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

function buildCoverPrompt({ input = {}, toc = {}, coverSettings = {}, coverVariant = 1 } = {}) {
  const genre = safeText(input.genre, 'memoir');
  const title = safeText(toc.title || input.customTitle, 'Personalized gift book');
  const subtitle = safeText(toc.subtitle || input.customSubtitle, 'Custom keepsake edition');
  const recipient = safeText(input.recipientName, 'the recipient');
  const tone = safeText(input.tone, 'heartwarming');
  const answers = Array.isArray(input.answers) ? input.answers.map(item => safeText(item)).filter(Boolean).slice(0, 4) : [];
  const paletteMode = coverSettings.paletteMode || 'auto';

  return [
    `Create abstract book-cover background art for a personalized printed gift book.`,
    `Title: "${title}". Subtitle: "${subtitle}".`,
    `Recipient inspiration: ${recipient}. Genre: ${genre}. Tone: ${tone}.`,
    answers.length ? `Personal details to reflect abstractly: ${answers.join(' | ')}.` : '',
    `Use rich, tasteful, commercial book-cover graphics. Avoid text inside the image because the app places title text separately.`,
    `Create artwork suitable for both front and back cover. Include abstract shapes and symbolic motifs, not a literal full cover layout.`,
    paletteMode === 'manual'
      ? `Use a palette close to ${coverSettings.primaryColor}, ${coverSettings.secondaryColor}, and ${coverSettings.accentColor}.`
      : `Use a genre-appropriate pastel-to-premium color palette.`,
    `Variation number: ${coverVariant}.`
  ].filter(Boolean).join('\n');
}

async function generateCoverArtBrief(payload = {}) {
  const provider = process.env.AI_COVER_PROVIDER || 'mock';
  const prompt = buildCoverPrompt(payload);

  // Local-safe default. This MVP does not call external AI unless a provider is configured later.
  if (provider === 'mock') {
    return {
      provider,
      enabled: false,
      prompt,
      message: 'Local vector cover art was used. Add an AI_COVER_PROVIDER and API key later to generate image assets.'
    };
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      provider,
      enabled: true,
      prompt,
      message: 'OpenAI image generation is configured. Wire this prompt to the image endpoint in production after final provider selection.'
    };
  }

  if (provider === 'replicate' && process.env.REPLICATE_API_TOKEN) {
    return {
      provider,
      enabled: true,
      prompt,
      message: 'Replicate image generation is configured. Wire this prompt to the selected model in production after final provider selection.'
    };
  }

  if (provider === 'stability' && process.env.STABILITY_API_KEY) {
    return {
      provider,
      enabled: true,
      prompt,
      message: 'Stability image generation is configured. Wire this prompt to the selected model in production after final provider selection.'
    };
  }

  return {
    provider,
    enabled: false,
    prompt,
    message: 'AI provider was selected, but the required API key is missing. Local vector cover art was used.'
  };
}

module.exports = { buildCoverPrompt, generateCoverArtBrief };
