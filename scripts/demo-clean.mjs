// Removes exactly the records demo-seed.mjs and demo-files.mjs created.
//
// It deletes by id from scripts/.demo-data.json and nothing else, so records
// that existed before seeding, or that you created yourself afterwards, are
// never touched.
//
// Usage: node scripts/demo-clean.mjs

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataFile = join(here, '.demo-data.json');

if (!existsSync(dataFile)) {
  console.error('scripts/.demo-data.json not found: there is no recorded demo data to remove.');
  process.exit(1);
}

function readProjectUrl() {
  const raw = readFileSync(join(root, 'apps/web/.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() === 'NEXT_PUBLIC_SUPABASE_URL') return rest.join('=').trim();
  }
  throw new Error('NEXT_PUBLIC_SUPABASE_URL not found');
}

function readServiceKey(projectRef) {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${projectRef} --output json`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const keys = JSON.parse(raw.slice(raw.indexOf('[')));
  const key = keys.find((entry) => entry.name === 'service_role');
  return key.api_key ?? key.apiKey;
}

const state = JSON.parse(readFileSync(dataFile, 'utf8'));
const url = readProjectUrl();
const db = createClient(url, readServiceKey(new URL(url).host.split('.')[0]), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function removeAll(table, ids) {
  if (!ids || ids.length === 0) return 0;
  let removed = 0;
  // Chunked: the id list for a term's sessions is long.
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { error } = await db.from(table).delete().in('id', slice);
    if (error) throw new Error(`${table}: ${error.message}`);
    removed += slice.length;
  }
  return removed;
}

console.log(`Removing demo data seeded at ${state.createdAt}`);

// Stored objects first, so no file is orphaned if a row delete fails.
if (state.storagePaths?.length) {
  const { error } = await db.storage.from('documents').remove(state.storagePaths);
  if (error) console.error(`  storage: ${error.message}`);
  else console.log(`  ${state.storagePaths.length} stored files`);
}

// Children before parents: reminders and documents reference tasks and sessions.
for (const [table, ids] of [
  ['reminders', state.reminders],
  ['documents', state.documents],
  ['inbox_items', state.inbox],
  ['tasks', state.tasks],
  ['class_sessions', state.sessions],
  ['subject_schedules', state.schedules],
  ['subjects', state.subjects],
]) {
  const removed = await removeAll(table, ids);
  if (removed > 0) console.log(`  ${removed} ${table}`);
}

rmSync(dataFile);
console.log('\nDemo data removed and scripts/.demo-data.json deleted.');
