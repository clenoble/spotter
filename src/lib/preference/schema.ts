import type { PreferenceDoc, PrefOp, PrefListField } from '$shared/types';

export const EMPTY_PREFERENCES: PreferenceDoc = {
  version: 1,
  topicsMore: [],
  topicsLess: [],
  tonePreferences: [],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0.15,
  explorationMode: 'mixed',
  customRules: [],
  updatedAt: new Date(0).toISOString()
};

// Seed preferences used by the SW only when the IndexedDB has no real
// preferences yet. Gives the fast re-ranker some signal before the user
// has had a chance to chat. Disappears the moment the user accepts any
// chat-proposed change.
export const BOOTSTRAP_PREFERENCES: PreferenceDoc = {
  version: 1,
  topicsMore: [
    'AI',
    'machine learning',
    'systems thinking',
    'open source',
    'privacy and user sovereignty',
    'personal computing',
    'software engineering depth'
  ],
  topicsLess: [
    'motivational posts',
    'hustle culture',
    'recruitment pitches',
    'promoted / sponsored content'
  ],
  tonePreferences: [
    'substantive',
    'technical depth over generic advice',
    'first-person reflection over third-person performative advice'
  ],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0.15,
  explorationMode: 'mixed',
  customRules: [],
  updatedAt: new Date(0).toISOString()
};

const LIST_FIELDS: PrefListField[] = [
  'topicsMore',
  'topicsLess',
  'tonePreferences',
  'authorsBoost',
  'authorsMute',
  'customRules'
];

export function hasAnyPrefs(prefs: PreferenceDoc): boolean {
  return LIST_FIELDS.some(f => prefs[f].length > 0);
}

export function applyOps(prefs: PreferenceDoc, ops: readonly PrefOp[]): PreferenceDoc {
  const next: PreferenceDoc = JSON.parse(JSON.stringify(prefs));
  for (const op of ops) {
    const list = next[op.field];
    if (op.op === 'add') {
      if (!list.includes(op.value)) list.push(op.value);
    } else {
      next[op.field] = list.filter(v => v !== op.value);
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function toMarkdown(doc: PreferenceDoc): string {
  const bullets = (xs: readonly string[]) =>
    xs.length ? xs.map(x => `- ${x}`).join('\n') : '- _(none yet)_';
  return [
    `# My preferences`,
    ``,
    `## Topics I want more of`,
    bullets(doc.topicsMore),
    ``,
    `## Topics I want less of`,
    bullets(doc.topicsLess),
    ``,
    `## Tone preferences`,
    bullets(doc.tonePreferences),
    ``,
    `## Authors to boost`,
    bullets(doc.authorsBoost),
    ``,
    `## Authors to mute`,
    bullets(doc.authorsMute),
    ``,
    `## Custom rules`,
    bullets(doc.customRules),
    ``,
    `## Exploration`,
    `- rate: ${Math.round(doc.explorationRate * 100)}%`,
    `- mode: ${doc.explorationMode}`,
    ``,
    `_Updated: ${doc.updatedAt}_`
  ].join('\n');
}
