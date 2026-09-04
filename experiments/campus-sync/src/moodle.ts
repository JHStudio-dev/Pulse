import {
  asRecordArray,
  epochSecondsToIsoDate,
  readNumber,
  readString,
  type CampusAnnouncement,
  type CampusAssignment,
  type CampusCourse,
  type CampusMaterial,
  type CampusProbe,
  type Mechanism,
} from './contract.ts';

/**
 * Moodle probe, targeting UNAH.
 *
 * Moodle ships a documented web services API, which is the highest priority
 * mechanism available. It is driven by a token the student generates in their
 * own Moodle profile, so Pulse never sees or stores a campus password.
 *
 * The token belongs to the student. Pass it at run time; do not commit it.
 */

interface MoodleOptions {
  baseUrl: string;
  token: string;
  userId?: number;
}

export class MoodleProbe implements CampusProbe {
  readonly platform = 'moodle';
  readonly mechanism: Mechanism = 'official_api';

  #baseUrl: string;
  #token: string;
  #userId: number | null;

  constructor(options: MoodleOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#token = options.token;
    this.#userId = options.userId ?? null;
  }

  /** Every web services call goes through here so failures read the same way. */
  async #call(wsfunction: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${this.#baseUrl}/webservice/rest/server.php`);
    url.searchParams.set('wstoken', this.#token);
    url.searchParams.set('wsfunction', wsfunction);
    url.searchParams.set('moodlewsrestformat', 'json');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`${wsfunction} returned HTTP ${response.status}`);
    }

    const body: unknown = await response.json();

    // Moodle reports errors with HTTP 200 and an exception payload.
    if (body !== null && typeof body === 'object' && 'exception' in body) {
      const record = body as Record<string, unknown>;
      throw new Error(
        `${wsfunction}: ${readString(record, 'errorcode') ?? 'error'} ${readString(record, 'message') ?? ''}`.trim(),
      );
    }

    return body;
  }

  /** Resolves the current user id, needed before courses can be listed. */
  async resolveUserId(): Promise<number> {
    if (this.#userId !== null) return this.#userId;

    const site = await this.#call('core_webservice_get_site_info');
    const record = (site ?? {}) as Record<string, unknown>;
    const id = readNumber(record, 'userid');
    if (id === null) {
      throw new Error('core_webservice_get_site_info did not return a user id');
    }
    this.#userId = id;
    return id;
  }

  async getCourses(): Promise<CampusCourse[]> {
    const userId = await this.resolveUserId();
    const data = await this.#call('core_enrol_get_users_courses', { userid: String(userId) });

    return asRecordArray(data).map((course) => ({
      externalId: readString(course, 'id') ?? '',
      name: readString(course, 'fullname') ?? readString(course, 'shortname') ?? 'Untitled',
      code: readString(course, 'idnumber') ?? readString(course, 'shortname'),
      url: `${this.#baseUrl}/course/view.php?id=${readString(course, 'id') ?? ''}`,
    }));
  }

  async getAssignments(courseId: string): Promise<CampusAssignment[]> {
    const data = await this.#call('mod_assign_get_assignments', { 'courseids[0]': courseId });

    const record = (data ?? {}) as Record<string, unknown>;
    const courses = asRecordArray(record['courses']);
    const assignments: CampusAssignment[] = [];

    for (const course of courses) {
      for (const item of asRecordArray(course['assignments'])) {
        assignments.push({
          externalId: readString(item, 'id') ?? '',
          courseExternalId: courseId,
          title: readString(item, 'name') ?? 'Untitled',
          description: readString(item, 'intro'),
          dueDate: epochSecondsToIsoDate(readNumber(item, 'duedate')),
          url: `${this.#baseUrl}/mod/assign/view.php?id=${readString(item, 'cmid') ?? ''}`,
        });
      }
    }

    return assignments;
  }

  async getMaterials(courseId: string): Promise<CampusMaterial[]> {
    const data = await this.#call('core_course_get_contents', { courseid: courseId });
    const materials: CampusMaterial[] = [];

    for (const section of asRecordArray(data)) {
      for (const module of asRecordArray(section['modules'])) {
        for (const file of asRecordArray(module['contents'])) {
          const url = readString(file, 'fileurl');
          materials.push({
            externalId: `${readString(module, 'id') ?? ''}:${readString(file, 'filename') ?? ''}`,
            courseExternalId: courseId,
            title: readString(file, 'filename') ?? readString(module, 'name') ?? 'Untitled',
            url,
            mimeType: readString(file, 'mimetype'),
            sizeBytes: readNumber(file, 'filesize'),
            downloadable: url !== null,
          });
        }
      }
    }

    return materials;
  }

  async getAnnouncements(courseId: string): Promise<CampusAnnouncement[]> {
    const forums = await this.#call('mod_forum_get_forums_by_courses', {
      'courseids[0]': courseId,
    });

    // Announcements live in the course news forum.
    const newsForum = asRecordArray(forums).find((forum) => readString(forum, 'type') === 'news');
    if (!newsForum) return [];

    const forumId = readString(newsForum, 'id');
    if (forumId === null) return [];

    const discussions = await this.#call('mod_forum_get_forum_discussions', {
      forumid: forumId,
    });
    const record = (discussions ?? {}) as Record<string, unknown>;

    return asRecordArray(record['discussions']).map((discussion) => ({
      externalId: readString(discussion, 'discussion') ?? readString(discussion, 'id') ?? '',
      courseExternalId: courseId,
      title: readString(discussion, 'subject') ?? 'Untitled',
      body: readString(discussion, 'message'),
      publishedAt: (() => {
        const created = readNumber(discussion, 'created');
        return created === null || created <= 0 ? null : new Date(created * 1000).toISOString();
      })(),
    }));
  }

  /**
   * Confirms a file is reachable without downloading it.
   *
   * Moodle file URLs need the token appended. A HEAD request is enough to prove
   * access, and avoids pulling course material onto disk during a probe.
   */
  async checkFileAccess(
    url: string,
  ): Promise<{ ok: boolean; status: number; contentType: string | null }> {
    const target = new URL(url);
    target.searchParams.set('token', this.#token);

    const response = await fetch(target, { method: 'HEAD' });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
    };
  }
}
