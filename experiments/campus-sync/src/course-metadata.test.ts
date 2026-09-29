import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { parseChamiloCoursePage } from './chamilo.ts';

describe('Chamilo course metadata', () => {
  it('reads title, teacher and section from the course page', () => {
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head><title>Administración I | UJCVx</title></head>
        <body>
          <div class="page-header"><h1>Administración I</h1></div>
          <div>Profesores: Lidia Victoria San Martin Chinchilla</div>
          <div>Sección: C</div>
        </body>
      </html>
    `);

    const course = parseChamiloCoursePage(
      dom.window.document,
      { externalId: 'ADM2011C1', sessionId: '0' },
      'https://campus.ujcv.edu.hn/courses/ADM2011C1/index.php?id_session=0',
    );

    expect(course).toMatchObject({
      externalId: 'ADM2011C1',
      sessionId: '0',
      title: 'Administración I',
      code: 'ADM2011C1',
      section: 'C',
      teacher: 'Lidia Victoria San Martin Chinchilla',
    });
  });

  it('falls back to the external id when the page has no useful title', () => {
    const dom = new JSDOM('<html><head><title>UJCVx</title></head><body></body></html>');

    const course = parseChamiloCoursePage(
      dom.window.document,
      { externalId: 'ADM2011C1' },
      'https://campus.ujcv.edu.hn/courses/ADM2011C1/index.php',
    );

    expect(course.title).toBe('ADM2011C1');
  });
});
