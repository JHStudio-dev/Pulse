import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChamiloProbe } from './chamilo.ts';
import { MoodleProbe } from './moodle.ts';
import { attempt, createReport, evaluate, toMarkdown, type Report } from './report.ts';

/**
 * Spike entry point.
 *
 * Credentials come from the environment at run time and are never written to
 * the findings file. Run against your own account only.
 */

const findingsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'findings');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`Missing ${name}. See experiments/campus-sync/README.md`);
    process.exit(2);
  }
  return value;
}

async function runMoodle(): Promise<Report> {
  const baseUrl = requireEnv('MOODLE_BASE_URL');
  const token = requireEnv('MOODLE_TOKEN');

  const probe = new MoodleProbe({ baseUrl, token });
  const report = createReport('UNAH / Moodle', baseUrl);
  console.log(`\nProbing ${report.platform} at ${baseUrl}`);

  let firstCourseId: string | null = null;
  let firstFileUrl: string | null = null;

  await attempt(report, 'courses', 'official_api', async () => {
    const courses = await probe.getCourses();
    firstCourseId = courses[0]?.externalId ?? null;
    return { count: courses.length, sample: courses[0], detail: 'core_enrol_get_users_courses' };
  });

  if (firstCourseId === null) {
    console.log('  no course returned; remaining capabilities cannot be probed');
    return report;
  }

  await attempt(report, 'assignments', 'official_api', async () => {
    const assignments = await probe.getAssignments(firstCourseId!);
    return {
      count: assignments.length,
      sample: assignments[0],
      detail: 'mod_assign_get_assignments',
    };
  });

  await attempt(report, 'due_dates', 'official_api', async () => {
    const assignments = await probe.getAssignments(firstCourseId!);
    const withDates = assignments.filter((assignment) => assignment.dueDate !== null);
    return {
      count: withDates.length,
      detail: `${withDates.length} of ${assignments.length} assignments carry a due date`,
    };
  });

  await attempt(report, 'materials', 'official_api', async () => {
    const materials = await probe.getMaterials(firstCourseId!);
    firstFileUrl = materials.find((material) => material.downloadable)?.url ?? null;
    return { count: materials.length, sample: materials[0], detail: 'core_course_get_contents' };
  });

  await attempt(report, 'file_download', 'official_api', async () => {
    if (firstFileUrl === null) {
      return { count: 0, detail: 'no downloadable file found in the first course' };
    }
    const access = await probe.checkFileAccess(firstFileUrl);
    return {
      count: access.ok ? 1 : 0,
      detail: `HEAD ${access.status}, content-type ${access.contentType ?? 'unknown'}`,
    };
  });

  await attempt(report, 'announcements', 'official_api', async () => {
    const announcements = await probe.getAnnouncements(firstCourseId!);
    return {
      count: announcements.length,
      sample: announcements[0],
      detail: 'mod_forum_get_forum_discussions',
    };
  });

  return report;
}

async function runChamilo(): Promise<Report> {
  const baseUrl = requireEnv('CHAMILO_BASE_URL');
  const apiKey = process.env['CHAMILO_API_KEY'];
  const username = process.env['CHAMILO_USERNAME'];

  const probe = new ChamiloProbe({
    baseUrl,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(username === undefined ? {} : { username }),
  });
  const report = createReport('UJCV / Chamilo', baseUrl);
  console.log(`\nProbing ${report.platform} at ${baseUrl}`);

  // Whether the REST module answers decides which mechanism is even possible.
  const availability = await probe.isRestAvailable();
  console.log(`  rest module: ${availability.detail}`);

  if (!availability.available || apiKey === undefined || username === undefined) {
    const detail = !availability.available
      ? availability.detail
      : 'API key or username not provided';

    for (const capability of [
      'courses',
      'assignments',
      'due_dates',
      'materials',
      'file_download',
      'announcements',
    ] as const) {
      report.results.push({
        capability,
        status: 'unsupported',
        mechanism: 'official_api',
        detail,
      });
    }

    console.log('  official API unavailable; evaluate a session-aware extension next');
    return report;
  }

  let firstCourseId: string | null = null;

  await attempt(report, 'courses', 'official_api', async () => {
    const courses = await probe.getCourses();
    firstCourseId = courses[0]?.externalId ?? null;
    return { count: courses.length, sample: courses[0], detail: 'course_list' };
  });

  if (firstCourseId === null) return report;

  await attempt(report, 'assignments', 'official_api', async () => {
    const assignments = await probe.getAssignments(firstCourseId!);
    return { count: assignments.length, sample: assignments[0], detail: 'course_exercises' };
  });

  await attempt(report, 'due_dates', 'official_api', async () => {
    const assignments = await probe.getAssignments(firstCourseId!);
    const withDates = assignments.filter((assignment) => assignment.dueDate !== null);
    return { count: withDates.length, detail: `${withDates.length} carry a due date` };
  });

  await attempt(report, 'materials', 'official_api', async () => {
    const materials = await probe.getMaterials(firstCourseId!);
    return { count: materials.length, sample: materials[0], detail: 'course_documents' };
  });

  await attempt(report, 'announcements', 'official_api', async () => {
    const announcements = await probe.getAnnouncements(firstCourseId!);
    return { count: announcements.length, detail: 'course_announcements' };
  });

  return report;
}

async function main(): Promise<void> {
  const target = process.argv[2];

  if (target !== 'moodle' && target !== 'chamilo') {
    console.error('Usage: npm run probe -- <moodle|chamilo>');
    process.exit(2);
  }

  const report = target === 'moodle' ? await runMoodle() : await runChamilo();
  const outcome = evaluate(report);

  await mkdir(findingsDir, { recursive: true });
  const file = join(findingsDir, `${target}.md`);
  await writeFile(file, toMarkdown(report), 'utf8');

  console.log(`\n${outcome.summary}`);
  console.log(`findings written to experiments/campus-sync/findings/${target}.md`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
