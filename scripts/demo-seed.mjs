// Fills the linked development project with a realistic Phase 1 dataset.
//
// Every inserted id is written to scripts/.demo-data.json so demo-clean.mjs can
// remove exactly what this created and nothing else. Existing records are never
// updated or deleted, apart from cancelling one generated demo session.
//
// Usage: node scripts/demo-seed.mjs

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outputFile = join(here, '.demo-data.json');

/** Reads the project url from the app's local env file. */
function readProjectUrl() {
  const raw = readFileSync(join(root, 'apps/web/.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() === 'NEXT_PUBLIC_SUPABASE_URL') return rest.join('=').trim();
  }
  throw new Error('NEXT_PUBLIC_SUPABASE_URL not found in apps/web/.env.local');
}

/**
 * Fetches the service role key through the CLI.
 *
 * Seeding writes rows on the student's behalf, which the anon key cannot do
 * without a browser session. The key is used in memory and never written out.
 */
function readServiceKey(projectRef) {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${projectRef} --output json`, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const keys = JSON.parse(raw.slice(raw.indexOf('[')));
  const key = keys.find((entry) => entry.name === 'service_role');
  if (!key) throw new Error('service_role key not available');
  return key.api_key ?? key.apiKey;
}

const url = readProjectUrl();
const projectRef = new URL(url).host.split('.')[0];
const db = createClient(url, readServiceKey(projectRef), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function insert(table, rows) {
  const { data, error } = await db.from(table).insert(rows).select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.map((row) => row.id);
}

/** Date offset from today, as YYYY-MM-DD. */
function day(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Context ---------------------------------------------------------------------

const { data: periods, error: periodError } = await db
  .from('academic_periods')
  .select('id, user_id, start_date, end_date, time_zone')
  .eq('status', 'active')
  .limit(1);

if (periodError) throw new Error(periodError.message);
const period = periods?.[0];
if (!period) {
  console.error('No active academic period found. Finish onboarding first.');
  process.exit(1);
}

const userId = period.user_id;
const { data: campuses } = await db.from('campus_instances').select('id').limit(1);
const campusId = campuses?.[0]?.id ?? null;

console.log(`Period ${period.id}`);
console.log(`Range  ${period.start_date} to ${period.end_date}`);

const created = {
  subjects: [],
  schedules: [],
  sessions: [],
  tasks: [],
  inbox: [],
  reminders: [],
  documents: [],
};

// Subjects --------------------------------------------------------------------

const SUBJECTS = [
  {
    name: 'Programación Orientada a Objetos',
    code: 'IS-301',
    professor: 'Ing. Marlon Pineda',
    modality: 'virtual',
    url: 'https://meet.google.com/poo-ujcv-301',
    campus: null,
    building: null,
    room: null,
    color: '#4c6ef5',
    slots: [
      { weekday: 1, start: '07:00', end: '08:30' },
      { weekday: 3, start: '07:00', end: '08:30' },
    ],
  },
  {
    name: 'Cálculo II',
    code: 'MM-202',
    professor: 'Lic. Ana Zelaya',
    modality: 'in_person',
    url: null,
    campus: 'Campus Central',
    building: 'Edificio B',
    room: '204',
    color: '#e8590c',
    slots: [
      { weekday: 2, start: '09:00', end: '10:30' },
      { weekday: 4, start: '09:00', end: '10:30' },
    ],
  },
  {
    name: 'Física General II',
    code: 'FS-210',
    professor: 'Ing. Rodolfo Cáceres',
    modality: 'in_person',
    url: null,
    campus: 'Campus Central',
    building: 'Laboratorio A',
    room: '105',
    color: '#2f9e44',
    slots: [
      { weekday: 1, start: '10:45', end: '12:15' },
      { weekday: 5, start: '10:45', end: '12:15' },
    ],
  },
  {
    name: 'Bases de Datos I',
    code: 'IS-305',
    professor: 'Ing. Karla Munguía',
    modality: 'hybrid',
    url: 'https://teams.microsoft.com/l/meetup-join/bd1-ujcv',
    campus: 'Campus Central',
    building: 'Edificio C',
    room: '310',
    color: '#7048e8',
    slots: [
      { weekday: 2, start: '13:00', end: '14:30' },
      { weekday: 4, start: '13:00', end: '14:30' },
    ],
  },
  {
    name: 'Estadística Aplicada',
    code: 'MM-240',
    professor: 'Lic. Óscar Interiano',
    modality: 'virtual',
    url: 'https://meet.google.com/est-ujcv-240',
    campus: null,
    building: null,
    room: null,
    color: '#0c8599',
    slots: [{ weekday: 3, start: '15:00', end: '17:00' }],
  },
  {
    name: 'Ingeniería de Software',
    code: 'IS-410',
    professor: 'Ing. Daniela Fajardo',
    modality: 'in_person',
    url: null,
    campus: 'Campus Central',
    building: 'Edificio C',
    room: '208',
    color: '#c2255c',
    slots: [
      { weekday: 1, start: '15:00', end: '16:30' },
      { weekday: 5, start: '15:00', end: '16:30' },
    ],
  },
  {
    name: 'Redes de Computadoras',
    code: 'IS-330',
    professor: 'Ing. Héctor Sandoval',
    modality: 'hybrid',
    url: 'https://meet.google.com/redes-ujcv-330',
    campus: 'Campus Central',
    building: 'Laboratorio B',
    room: '112',
    color: '#f08c00',
    slots: [{ weekday: 4, start: '17:00', end: '19:00' }],
  },
];

console.log('\nSubjects');

for (const subject of SUBJECTS) {
  const [id] = await insert('subjects', [
    {
      user_id: userId,
      academic_period_id: period.id,
      campus_instance_id: campusId,
      name: subject.name,
      code: subject.code,
      professor_name: subject.professor,
      default_modality: subject.modality,
      default_meeting_url: subject.url,
      default_campus: subject.campus,
      default_building: subject.building,
      default_room: subject.room,
      travel_buffer_minutes: subject.modality === 'in_person' ? 25 : null,
      color: subject.color,
    },
  ]);

  subject.id = id;
  created.subjects.push(id);

  const scheduleIds = await insert(
    'subject_schedules',
    subject.slots.map((slot) => ({
      user_id: userId,
      subject_id: id,
      weekday: slot.weekday,
      start_time: slot.start,
      end_time: slot.end,
      modality: subject.modality,
      meeting_url: subject.url,
      campus: subject.campus,
      building: subject.building,
      room: subject.room,
    })),
  );

  subject.scheduleIds = scheduleIds;
  created.schedules.push(...scheduleIds);
  console.log(`  ${subject.code}  ${subject.name}`);
}

// Class sessions --------------------------------------------------------------

console.log('\nClass sessions');

const sessionRows = [];
for (const subject of SUBJECTS) {
  subject.slots.forEach((slot, index) => {
    const cursor = new Date(`${period.start_date}T00:00:00Z`);
    const end = new Date(`${period.end_date}T00:00:00Z`);

    while (cursor <= end) {
      const isoWeekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
      if (isoWeekday === slot.weekday) {
        sessionRows.push({
          user_id: userId,
          subject_id: subject.id,
          subject_schedule_id: subject.scheduleIds[index],
          session_date: cursor.toISOString().slice(0, 10),
          start_time: slot.start,
          end_time: slot.end,
          modality: subject.modality,
          status: 'scheduled',
          meeting_url: subject.url,
          campus: subject.campus,
          building: subject.building,
          room: subject.room,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  });
}

// Inserted in batches; a whole term is several hundred rows.
for (let i = 0; i < sessionRows.length; i += 200) {
  created.sessions.push(...(await insert('class_sessions', sessionRows.slice(i, i + 200))));
}
console.log(`  ${created.sessions.length} sessions`);

// One cancelled class, so that state is visible somewhere.
const upcoming =
  created.sessions.length > 0
    ? (
        await db
          .from('class_sessions')
          .select('id')
          .in('id', created.sessions.slice(0, 200))
          .gt('session_date', day(0))
          .order('session_date')
          .limit(1)
      ).data?.[0]
    : null;

if (upcoming) {
  await db
    .from('class_sessions')
    .update({ status: 'cancelled', cancelled_reason: 'Suspendida por actividad institucional' })
    .eq('id', upcoming.id);
  console.log('  1 marked cancelled');
}

// Tasks -----------------------------------------------------------------------

console.log('\nTasks');

const TASKS = [
  {
    s: 0,
    title: 'Entregar diagrama de clases del proyecto',
    due: 3,
    status: 'pending',
    difficulty: 'medium',
    progress: 30,
    weight: 15,
  },
  {
    s: 0,
    title: 'Laboratorio 4: herencia y polimorfismo',
    due: 0,
    status: 'in_progress',
    difficulty: 'easy',
    progress: 60,
    weight: 5,
  },
  {
    s: 1,
    title: 'Serie de ejercicios: integrales por partes',
    due: -2,
    status: 'pending',
    difficulty: 'hard',
    progress: 0,
    weight: 10,
  },
  {
    s: 2,
    title: 'Informe de laboratorio: circuitos RC',
    due: 7,
    status: 'pending',
    difficulty: 'medium',
    progress: 0,
    weight: 20,
  },
  {
    s: 3,
    title: 'Modelo entidad-relación del caso de estudio',
    due: 5,
    status: 'in_progress',
    difficulty: 'hard',
    progress: 45,
    weight: 25,
  },
  {
    s: 3,
    title: 'Consultas SQL con joins múltiples',
    due: -5,
    status: 'pending',
    difficulty: 'medium',
    progress: 20,
    weight: 10,
  },
  {
    s: 4,
    title: 'Análisis de regresión con datos del INE',
    due: 12,
    status: 'pending',
    difficulty: 'medium',
    progress: 0,
    weight: 15,
  },
  {
    s: 5,
    title: 'Documento de requerimientos del sistema',
    due: 1,
    status: 'in_progress',
    difficulty: 'hard',
    progress: 70,
    weight: 30,
  },
  {
    s: 6,
    title: 'Configuración de VLANs en Packet Tracer',
    due: 9,
    status: 'pending',
    difficulty: 'medium',
    progress: 0,
    weight: 15,
  },
  {
    s: 0,
    title: 'Lectura: principios SOLID',
    due: -8,
    status: 'done',
    difficulty: 'easy',
    progress: 100,
    weight: 5,
  },
  {
    s: 1,
    title: 'Quiz de derivadas implícitas',
    due: -10,
    status: 'submitted',
    difficulty: 'medium',
    progress: 100,
    weight: 10,
  },
  {
    s: 5,
    title: 'Presentación de avance del proyecto',
    due: -6,
    status: 'done',
    difficulty: 'medium',
    progress: 100,
    weight: 20,
  },
];

created.tasks = await insert(
  'tasks',
  TASKS.map((task) => ({
    user_id: userId,
    subject_id: SUBJECTS[task.s].id,
    title: task.title,
    due_date: day(task.due),
    due_time: task.due === 0 ? '23:59' : null,
    status: task.status,
    difficulty: task.difficulty,
    progress: task.progress,
    academic_weight: task.weight,
  })),
);
console.log(`  ${created.tasks.length} tasks`);

// Inbox -----------------------------------------------------------------------

console.log('\nInbox');

const INBOX = [
  { s: 3, text: 'Bases de Datos - el profe dijo que el parcial incluye normalización hasta 3FN' },
  { s: 6, text: 'Preguntar en Redes si el laboratorio del jueves se hace presencial o virtual' },
  {
    s: 2,
    text: 'Física - traer calculadora científica y bata para la práctica de la próxima semana',
  },
  { s: 5, text: 'Revisar el formato APA que pidieron para el documento de requerimientos' },
];

created.inbox = await insert(
  'inbox_items',
  INBOX.map((item) => ({
    user_id: userId,
    raw_text: item.text,
    subject_id: SUBJECTS[item.s].id,
  })),
);
console.log(`  ${created.inbox.length} items`);

// Reminders -------------------------------------------------------------------

console.log('\nReminders');

created.reminders = await insert('reminders', [
  {
    user_id: userId,
    target_kind: 'task',
    task_id: created.tasks[0],
    kind: 'lead_time',
    offset_minutes: 1440,
  },
  {
    user_id: userId,
    target_kind: 'task',
    task_id: created.tasks[3],
    kind: 'lead_time',
    offset_minutes: 4320,
  },
  {
    user_id: userId,
    target_kind: 'task',
    task_id: created.tasks[7],
    kind: 'lead_time',
    offset_minutes: 1440,
  },
  {
    user_id: userId,
    target_kind: 'task',
    task_id: created.tasks[4],
    kind: 'lead_time',
    offset_minutes: 10080,
  },
]);

const { data: nextSession } = await db
  .from('class_sessions')
  .select('id')
  .in('id', created.sessions.slice(0, 200))
  .eq('status', 'scheduled')
  .gte('session_date', day(0))
  .order('session_date')
  .limit(1);

if (nextSession?.[0]) {
  const ids = await insert('reminders', [
    {
      user_id: userId,
      target_kind: 'class_session',
      class_session_id: nextSession[0].id,
      kind: 'lead_time',
      offset_minutes: 30,
    },
  ]);
  created.reminders.push(...ids);
}
console.log(`  ${created.reminders.length} reminders`);

writeFileSync(
  outputFile,
  JSON.stringify({ createdAt: new Date().toISOString(), userId, ...created }, null, 2),
);
console.log('\nIds written to scripts/.demo-data.json');
