import {
  asRecordArray,
  readString,
  type CampusAnnouncement,
  type CampusAssignment,
  type CampusCourse,
  type CampusMaterial,
  type CampusProbe,
  type Mechanism,
} from './contract.ts';

/**
 * Chamilo probe, targeting UJCV.
 *
 * Chamilo's REST module is frequently disabled, so this probe first asks
 * whether the API answers at all. When it does not, the finding is that the
 * official route is unavailable and the next mechanism down the list
 * (a session-aware extension) has to be evaluated instead.
 *
 * Authentication uses an API key the student generates in their own profile.
 * If the deployment does not expose one, the probe reports that rather than
 * asking for a password: Pulse never stores campus credentials.
 */

interface ChamiloOptions {
  baseUrl: string;
  /** Chamilo API key from the student's own profile, when the module is on. */
  apiKey?: string;
  username?: string;
}

export class ChamiloProbe implements CampusProbe {
  readonly platform = 'chamilo';
  readonly mechanism: Mechanism = 'official_api';

  #baseUrl: string;
  #apiKey: string | null;
  #username: string | null;

  constructor(options: ChamiloOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#apiKey = options.apiKey ?? null;
    this.#username = options.username ?? null;
  }

  /** True when the REST module answers, which decides the whole approach. */
  async isRestAvailable(): Promise<{ available: boolean; status: number; detail: string }> {
    const endpoint = `${this.#baseUrl}/main/webservices/api/v2.php`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action: 'authenticate' }),
      });

      const text = await response.text();
      const looksLikeApi = text.trim().startsWith('{') || text.trim().startsWith('[');

      return {
        available: response.ok && looksLikeApi,
        status: response.status,
        detail: looksLikeApi
          ? `endpoint responded with JSON (${response.status})`
          : `endpoint did not return JSON (${response.status}); REST module likely disabled`,
      };
    } catch (error) {
      return {
        available: false,
        status: 0,
        detail: error instanceof Error ? error.message : 'request failed',
      };
    }
  }

  async #call(action: string, params: Record<string, string> = {}): Promise<unknown> {
    if (this.#apiKey === null || this.#username === null) {
      throw new Error('Chamilo API key and username are required for REST calls');
    }

    const response = await fetch(`${this.#baseUrl}/main/webservices/api/v2.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action,
        username: this.#username,
        api_key: this.#apiKey,
        ...params,
      }),
    });

    if (!response.ok) {
      throw new Error(`${action} returned HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    if (body !== null && typeof body === 'object' && 'error' in body) {
      const record = body as Record<string, unknown>;
      throw new Error(`${action}: ${readString(record, 'message') ?? 'error'}`);
    }
    return body;
  }

  async getCourses(): Promise<CampusCourse[]> {
    const data = await this.#call('course_list');
    const record = (data ?? {}) as Record<string, unknown>;
    const list = Array.isArray(data) ? data : record['data'];

    return asRecordArray(list).map((course) => ({
      externalId: readString(course, 'id') ?? readString(course, 'code') ?? '',
      name: readString(course, 'title') ?? readString(course, 'name') ?? 'Untitled',
      code: readString(course, 'code'),
      url: readString(course, 'url'),
    }));
  }

  async getAssignments(courseId: string): Promise<CampusAssignment[]> {
    const data = await this.#call('course_exercises', { course: courseId });
    const record = (data ?? {}) as Record<string, unknown>;
    const list = Array.isArray(data) ? data : record['data'];

    return asRecordArray(list).map((item) => ({
      externalId: readString(item, 'id') ?? '',
      courseExternalId: courseId,
      title: readString(item, 'title') ?? 'Untitled',
      description: readString(item, 'description'),
      dueDate: readString(item, 'end_time')?.slice(0, 10) ?? null,
      url: readString(item, 'url'),
    }));
  }

  async getMaterials(courseId: string): Promise<CampusMaterial[]> {
    const data = await this.#call('course_documents', { course: courseId });
    const record = (data ?? {}) as Record<string, unknown>;
    const list = Array.isArray(data) ? data : record['data'];

    return asRecordArray(list).map((item) => {
      const url = readString(item, 'url');
      return {
        externalId: readString(item, 'id') ?? '',
        courseExternalId: courseId,
        title: readString(item, 'title') ?? readString(item, 'path') ?? 'Untitled',
        url,
        mimeType: null,
        sizeBytes: null,
        downloadable: url !== null,
      };
    });
  }

  async getAnnouncements(courseId: string): Promise<CampusAnnouncement[]> {
    const data = await this.#call('course_announcements', { course: courseId });
    const record = (data ?? {}) as Record<string, unknown>;
    const list = Array.isArray(data) ? data : record['data'];

    return asRecordArray(list).map((item) => ({
      externalId: readString(item, 'id') ?? '',
      courseExternalId: courseId,
      title: readString(item, 'title') ?? 'Untitled',
      body: readString(item, 'content'),
      publishedAt: readString(item, 'date'),
    }));
  }

  async checkFileAccess(
    url: string,
  ): Promise<{ ok: boolean; status: number; contentType: string | null }> {
    const response = await fetch(url, { method: 'HEAD' });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
    };
  }
}
