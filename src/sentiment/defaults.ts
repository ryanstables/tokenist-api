export const BUILTIN_LABELS = [
  { name: 'success',          displayName: 'Success',     description: 'assistant gave a complete, accurate, and helpful response that clearly and fully addressed the user\'s request', color: '#22c55e', sortOrder: 0 },
  { name: 'laziness',         displayName: 'Lazy',        description: 'assistant gave a blank, minimal, or low-effort response', color: '#eab308', sortOrder: 1 },
  { name: 'forgetting',       displayName: 'Forgot',      description: 'assistant forgot important context the user previously provided', color: '#f97316', sortOrder: 2 },
  { name: 'task_failure',     displayName: 'Failure',     description: 'assistant failed, refused, or could not complete the requested task', color: '#f97316', sortOrder: 3 },
  { name: 'user_frustration', displayName: 'Frustrated',  description: 'user expressed frustration, anger, or disappointment', color: '#f97316', sortOrder: 4 },
  { name: 'nsfw',             displayName: 'NSFW',        description: 'explicit, harmful, or adult content was involved', color: '#ef4444', sortOrder: 5 },
  { name: 'jailbreaking',     displayName: 'Jailbreak',   description: 'user tried to manipulate or bypass the assistant\'s guidelines', color: '#ef4444', sortOrder: 6 },
] as const;
