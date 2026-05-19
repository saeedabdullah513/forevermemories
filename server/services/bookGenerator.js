const genreProfiles = {
  memoir: {
    label: 'Life Story Memoir',
    promise: 'a warm, reflective personal journey',
    beats: ['Origin', 'Turning Point', 'Challenge', 'Growth', 'Legacy'],
    titleWords: ['Life', 'Journey', 'Pages', 'Legacy', 'Moments']
  },
  romance: {
    label: 'Personalized Romance',
    promise: 'a heartfelt story shaped by memory, courage, and love',
    beats: ['First Spark', 'Distance', 'Choice', 'Trust', 'Forever'],
    titleWords: ['Heart', 'Forever', 'Promise', 'Stars', 'Love']
  },
  adventure: {
    label: 'Adventure Novel',
    promise: 'a fast-moving quest built around courage and discovery',
    beats: ['Call', 'Map', 'Danger', 'Discovery', 'Return'],
    titleWords: ['Quest', 'Roads', 'Map', 'Horizon', 'Bravery']
  },
  fantasy: {
    label: 'Fantasy Quest',
    promise: 'a magical journey where the recipient becomes central to the world',
    beats: ['Portal', 'Gift', 'Trial', 'Alliance', 'Restoration'],
    titleWords: ['Kingdom', 'Lantern', 'Crown', 'Realm', 'Magic']
  },
  comedy: {
    label: 'Comedy Gift Book',
    promise: 'a funny, affectionate book full of inside jokes and playful chapters',
    beats: ['The Legend', 'The Chaos', 'The Comeback', 'The Roast', 'The Applause'],
    titleWords: ['Legend', 'Chaos', 'Laughs', 'Adventures', 'Applause']
  },
  leadership: {
    label: 'Inspirational Leadership Book',
    promise: 'a polished personal-growth book shaped around values and impact',
    beats: ['Principles', 'Pressure', 'Decisions', 'People', 'Legacy'],
    titleWords: ['Courage', 'Character', 'Legacy', 'Purpose', 'Impact']
  }
};

const chapterNouns = [
  'The Beginning No One Expected', 'A Name That Carries a Story', 'The World Around the Main Character',
  'Small Details That Matter', 'The First Real Test', 'A Memory That Changes Everything',
  'People Who Shaped the Journey', 'The Problem That Would Not Go Away', 'A Choice Made Under Pressure',
  'The Hidden Strength Within', 'A Season of Change', 'Lessons Learned the Hard Way',
  'The Moment Things Became Clear', 'A Gift Only They Could Give', 'The Road Back to Hope',
  'What the Story Leaves Behind', 'A Future Worth Celebrating', 'The Final Page, Still Unwritten'
];

const stopWords = new Set([
  'about', 'after', 'again', 'also', 'because', 'being', 'birthday', 'could', 'every', 'their', 'there', 'these', 'thing', 'things', 'should', 'would', 'where', 'which', 'while', 'with', 'without', 'from', 'into', 'just', 'like', 'love', 'loved', 'memory', 'memories', 'person', 'people', 'story', 'stories', 'family', 'friend', 'friends', 'father', 'mother', 'sister', 'brother', 'wife', 'husband', 'name', 'place', 'places', 'moment', 'moments', 'special', 'book', 'gift'
]);

function clean(value = '') {
  return String(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

function toTitleCase(value = '') {
  return clean(value)
    .split(' ')
    .filter(Boolean)
    .map(word => word.length <= 2 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function normalizeTitleToken(value = '') {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function titleLastWord(value = '') {
  const words = clean(value).split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1].replace(/[^a-z0-9'-]/gi, '') : '';
}

function combineDetailAndTitleWord(detail = '', titleWord = '') {
  const cleanedDetail = clean(detail);
  const cleanedWord = clean(titleWord);
  if (!cleanedDetail) return cleanedWord;
  if (!cleanedWord) return cleanedDetail;
  const detailLast = normalizeTitleToken(titleLastWord(cleanedDetail));
  const wordNormalized = normalizeTitleToken(cleanedWord);
  if (detailLast && detailLast === wordNormalized) return cleanedDetail;
  if (normalizeTitleToken(cleanedDetail).endsWith(wordNormalized)) return cleanedDetail;
  return `${cleanedDetail} ${cleanedWord}`;
}

function cleanGeneratedTitle(title = '') {
  let cleaned = clean(title)
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/([,.:;!?])\s*\1+/g, '$1')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+:\s+/g, ': ')
    .trim();

  // Fix repeated trailing words and phrases, e.g. "Kingdom, Kingdom" or "Magic Magic".
  cleaned = cleaned.replace(/\b([a-z][a-z0-9'-]+)(?:\s*,?\s+\1\b)+$/i, '$1');
  cleaned = cleaned.replace(/,\s*([^,]+)$/i, (match, lastPhrase, offset, whole) => {
    const before = whole.slice(0, offset).trim();
    const beforeWords = before.split(/\s+/).slice(-lastPhrase.trim().split(/\s+/).length).join(' ');
    return normalizeTitleToken(beforeWords) === normalizeTitleToken(lastPhrase) ? '' : match;
  });

  // Fix repeated adjacent title words anywhere in the title.
  cleaned = cleaned.replace(/\b([a-z][a-z0-9'-]+)\s+\1\b/ig, '$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function firstUsefulPhrase(value = '', maxWords = 3) {
  const cleaned = clean(value)
    .replace(/[.,!?;:()\[\]{}"“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const commaPhrase = cleaned.split(/,|\band\b|\bbut\b|\bwhen\b|\bwhere\b/i).map(clean).find(Boolean);
  const source = commaPhrase || cleaned;
  const words = source.split(' ').filter(word => {
    const normalized = word.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    return normalized.length > 2 && !stopWords.has(normalized);
  });
  return toTitleCase(words.slice(0, maxWords).join(' '));
}

function extractTraits(answers = []) {
  const traitSource = clean(answers[0] || '');
  if (!traitSource) return [];
  return traitSource
    .split(/,|\/|\band\b/i)
    .map(item => toTitleCase(item))
    .filter(item => item.length > 2)
    .slice(0, 3);
}

function deriveTitleParts(input = {}) {
  const answers = Array.isArray(input.answers) ? input.answers.map(a => clean(a)).filter(Boolean) : [];
  const traits = extractTraits(answers);
  const memoryPhrase = firstUsefulPhrase(answers[1] || answers[3] || '', 3);
  const themePhrase = firstUsefulPhrase(answers[2] || answers[1] || '', 3);
  const placePhrase = firstUsefulPhrase(answers[3] || answers[1] || '', 2);
  const occasionPhrase = firstUsefulPhrase(input.occasion || '', 2);
  const relationship = firstUsefulPhrase(input.relationship || '', 2);

  return {
    trait: traits[0] || '',
    secondTrait: traits[1] || '',
    memoryPhrase,
    themePhrase,
    placePhrase,
    occasionPhrase,
    relationship
  };
}

function buildTitle(input = {}, attempt = 1) {
  if (clean(input.customTitle)) return cleanGeneratedTitle(clean(input.customTitle));
  const name = clean(input.recipientName || 'Someone Special');
  const genreKey = input.genre || 'memoir';
  const genre = genreProfiles[genreKey] || genreProfiles.memoir;
  const tone = toTitleCase(input.tone || 'heartwarming');
  const parts = deriveTitleParts(input);
  const titleWord = genre.titleWords[(Number(attempt || 1) - 1) % genre.titleWords.length];

  const fallbackDetail = parts.themePhrase || parts.memoryPhrase || parts.trait || parts.occasionPhrase || titleWord;
  const detailWithTitleWord = combineDetailAndTitleWord(fallbackDetail, titleWord);

  const templates = {
    memoir: [
      `${name}: The ${detailWithTitleWord}`,
      `The Pages of ${name}: ${parts.trait || tone}, ${parts.secondTrait || 'True'}, and Unforgettable`,
      `${name}'s ${parts.themePhrase || titleWord}: A Life Story in Moments`
    ],
    romance: [
      `${name} and the ${detailWithTitleWord}`,
      `When ${name} Found ${parts.themePhrase || 'Forever'}`,
      `${name}'s ${parts.memoryPhrase || titleWord}: A Love Story Made Personal`
    ],
    adventure: [
      `${name} and the ${detailWithTitleWord}`,
      `The ${parts.placePhrase || titleWord} Adventure of ${name}`,
      `${name}'s Map to ${parts.themePhrase || 'the Unknown'}`
    ],
    fantasy: [
      `${name} and the ${detailWithTitleWord}`,
      `The ${parts.placePhrase || titleWord} of ${name}`,
      `${name}'s ${parts.themePhrase || 'Hidden'} Realm`
    ],
    comedy: [
      `The ${combineDetailAndTitleWord(parts.trait || 'Completely', titleWord)} of ${name}`,
      `${name} and the ${fallbackDetail} Incident`,
      `The Almost True Adventures of ${name}`
    ],
    leadership: [
      `${name}: The ${detailWithTitleWord}`,
      `${name}'s Guide to ${parts.themePhrase || 'Courage'}`,
      `The ${parts.trait || 'Quiet'} Impact of ${name}`
    ]
  };

  const options = templates[genreKey] || [`${name}: A ${tone} ${genre.label}`];
  let title = options[(Number(attempt || 1) - 1) % options.length];
  title = title.replace(/\s+/g, ' ').replace(/: :/g, ':').trim();
  return cleanGeneratedTitle(title);
}

function buildSubtitle(input = {}) {
  if (clean(input.customSubtitle)) return clean(input.customSubtitle);
  const genre = genreProfiles[input.genre] || genreProfiles.memoir;
  const occasion = clean(input.occasion || 'keepsake gift').toLowerCase();
  const relationship = clean(input.relationship || 'someone special').toLowerCase();
  const parts = deriveTitleParts(input);
  const detail = parts.themePhrase || parts.memoryPhrase || parts.trait;
  return detail
    ? `A custom ${genre.label.toLowerCase()} for a ${relationship}, inspired by ${detail.toLowerCase()}`
    : `A custom ${genre.label.toLowerCase()} created as a ${occasion}`;
}

function generateToc(input = {}, attempt = 1) {
  const name = clean(input.recipientName || 'Someone Special');
  const relationship = clean(input.relationship || 'loved one');
  const occasion = clean(input.occasion || 'special gift');
  const genre = genreProfiles[input.genre] || genreProfiles.memoir;
  const answers = Array.isArray(input.answers) ? input.answers.map(a => clean(a)).filter(Boolean) : [];
  const lifeDetails = clean(input.lifeNotes || '') || clean(input.storyUpload?.extractedText || '');
  const details = answers.length ? answers : (lifeDetails ? [lifeDetails] : ['their personality', 'favorite memories', 'meaningful moments']);

  const rotatedNouns = [...chapterNouns.slice((Number(attempt || 1) - 1) * 3), ...chapterNouns.slice(0, (Number(attempt || 1) - 1) * 3)];
  const chapters = rotatedNouns.map((base, index) => {
    const beat = genre.beats[index % genre.beats.length];
    const detail = details[index % details.length];
    const start = (index * 8) + 1;
    const end = index === chapterNouns.length - 1 ? 160 : start + 7;
    return {
      chapter: index + 1,
      title: `${base}: ${beat}`,
      pages: `${start}-${end}`,
      summary: `This chapter turns ${String(detail).slice(0, 450).toLowerCase()} into part of ${name}'s ${genre.promise}. It keeps the tone personal for a ${relationship} and connects the story to the ${occasion}.`
    };
  });

  return {
    title: buildTitle(input, attempt),
    subtitle: buildSubtitle(input),
    estimatedPages: 160,
    genre: genre.label,
    titleInputs: deriveTitleParts(input),
    structureNote: '18 chapters at roughly 8 to 10 pages each, sized for a 6 x 9 printed gift book. The title is generated from the selected genre, recipient name, relationship, occasion, tone, and personal answers.',
    chapters
  };
}

module.exports = { generateToc, genreProfiles, buildTitle, buildSubtitle, deriveTitleParts };
