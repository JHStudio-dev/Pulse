// Uploads a few small demo documents and records them.
//
// Runs after demo-seed.mjs and appends the created ids to the same file, so the
// cleanup script removes both the rows and the stored objects.
//
// Usage: node scripts/demo-files.mjs

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataFile = join(here, '.demo-data.json');

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

const { data: subjects } = await db.from('subjects').select('id, code').in('id', state.subjects);

const byCode = new Map(subjects.map((subject) => [subject.code, subject.id]));

/** Small text files, so nothing large is left in the bucket. */
const FILES = [
  {
    code: 'IS-301',
    title: 'Guía de la práctica 4 — herencia y polimorfismo',
    name: 'guia-practica-4.txt',
    body: [
      'Programación Orientada a Objetos — Guía de práctica 4',
      '',
      'Objetivo: aplicar herencia y polimorfismo en un caso concreto.',
      '',
      '1. Definir la clase base Vehiculo con los atributos comunes.',
      '2. Derivar Automovil y Motocicleta sobrescribiendo calcularImpuesto().',
      '3. Demostrar el enlace dinámico recorriendo una lista de Vehiculo.',
      '',
      'Entrega: repositorio con el código y un README corto.',
    ].join('\n'),
  },
  {
    code: 'IS-305',
    title: 'Caso de estudio — sistema de biblioteca',
    name: 'caso-estudio-biblioteca.txt',
    body: [
      'Bases de Datos I — Caso de estudio',
      '',
      'La biblioteca registra socios, ejemplares y préstamos.',
      'Un socio puede tener varios préstamos activos, con un máximo de tres.',
      'Cada ejemplar pertenece a un título y tiene un estado.',
      '',
      'Se pide el modelo entidad-relación y su paso a tablas en 3FN.',
    ].join('\n'),
  },
  {
    code: 'FS-210',
    title: 'Formato de informe de laboratorio',
    name: 'formato-informe-laboratorio.txt',
    body: [
      'Física General II — Formato del informe',
      '',
      'Portada, objetivos, marco teórico, materiales, procedimiento,',
      'datos obtenidos, análisis, conclusiones y bibliografía.',
      '',
      'Las tablas llevan título arriba y las figuras al pie.',
      'Los datos se reportan con su incertidumbre.',
    ].join('\n'),
  },
];

state.documents = state.documents ?? [];
state.storagePaths = state.storagePaths ?? [];

console.log('Documents');

for (const file of FILES) {
  const subjectId = byCode.get(file.code);
  if (!subjectId) continue;

  const bytes = Buffer.from(file.body, 'utf8');
  const objectPath = `${state.userId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await db.storage
    .from('documents')
    .upload(objectPath, bytes, { contentType: 'text/plain', upsert: false });

  if (uploadError) {
    console.error(`  failed to upload ${file.name}: ${uploadError.message}`);
    continue;
  }

  const { data, error } = await db
    .from('documents')
    .insert({
      user_id: state.userId,
      subject_id: subjectId,
      title: file.title,
      source: 'upload',
      storage_path: objectPath,
      mime_type: 'text/plain',
      size_bytes: bytes.length,
    })
    .select('id')
    .single();

  if (error) {
    await db.storage.from('documents').remove([objectPath]);
    console.error(`  failed to record ${file.name}: ${error.message}`);
    continue;
  }

  state.documents.push(data.id);
  state.storagePaths.push(objectPath);
  console.log(`  ${file.code}  ${file.title}`);
}

writeFileSync(dataFile, JSON.stringify(state, null, 2));
console.log(`\n${state.documents.length} documents recorded`);
