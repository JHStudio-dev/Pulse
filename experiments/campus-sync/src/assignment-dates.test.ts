import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  inferChamiloAssignmentDueAt,
  inspectChamiloAssignmentDeadline,
  mergeChamiloAssignmentDeadlines,
  mergeChamiloAssignmentDetail,
  normalizeChamiloDateTime,
  parseChamiloAssignments,
  parseChamiloAssignmentDetail,
} from './chamilo.ts';

const COURSE = { externalId: 'ADM2011C1', sessionId: '0' };
const LIST_URL = 'https://campus.ujcv.edu.hn/main/work/work.php?cidReq=ADM2011C1';
const DETAIL_URL = 'https://campus.ujcv.edu.hn/main/work/work_list.php?cidReq=ADM2011C1&id=2074726';

describe('Chamilo deadlines', () => {
  it.each([
    ['2026-10-12 23:45:00', '2026-10-12T23:45:00'],
    ['12/10/2026 23:45', '2026-10-12T23:45:00'],
    ['12 de octubre de 2026 a las 11:45 pm', '2026-10-12T23:45:00'],
    ['2026-10-12', '2026-10-12'],
    ['12/10/2026', '2026-10-12'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeChamiloDateTime(input)).toBe(expected);
  });

  it('infers a deadline written in the task title when Chamilo exposes no date column', () => {
    expect(
      inferChamiloAssignmentDueAt(
        'TAREA 3 - FECHA LIMITE 5 DE OCTUBRE',
        new Date('2026-10-01T12:00:00Z'),
      ),
    ).toBe('2026-10-05');
  });

  it('does not treat an ordinary date in the title as a deadline', () => {
    expect(
      inferChamiloAssignmentDueAt(
        'Lectura del capítulo 5 de octubre',
        new Date('2026-10-01T12:00:00Z'),
      ),
    ).toBeUndefined();
  });

  it('uses an assignment event from the agenda when the task page has no deadline', () => {
    const [assignment] = mergeChamiloAssignmentDeadlines(
      [
        {
          externalId: '2074726',
          courseExternalId: COURSE.externalId,
          title: 'Entrega de ensayo',
          sourceUrl: DETAIL_URL,
        },
      ],
      [
        {
          courseExternalId: COURSE.externalId,
          title: 'Entrega de tarea Entrega de ensayo',
          startsAt: '2026-10-12T23:45:00',
          allDay: false,
          sourceType: 'assignment',
          sourceExternalId: '2074726',
          sourceUrl: DETAIL_URL,
        },
      ],
    );

    expect(assignment?.dueAt).toBe('2026-10-12T23:45:00');
  });

  it('keeps the structured assignment deadline over the agenda fallback', () => {
    const [assignment] = mergeChamiloAssignmentDeadlines(
      [
        {
          externalId: '2074726',
          courseExternalId: COURSE.externalId,
          title: 'Entrega de ensayo',
          dueAt: '2026-10-13T10:00:00',
          sourceUrl: DETAIL_URL,
        },
      ],
      [
        {
          courseExternalId: COURSE.externalId,
          title: 'Entrega de tarea Entrega de ensayo',
          startsAt: '2026-10-12T23:45:00',
          allDay: false,
          sourceType: 'assignment',
          sourceExternalId: '2074726',
          sourceUrl: DETAIL_URL,
        },
      ],
    );

    expect(assignment?.dueAt).toBe('2026-10-13T10:00:00');
  });

  it('ignores impossible dates', () => {
    expect(normalizeChamiloDateTime('2026-02-30')).toBeUndefined();
  });

  it('prefers the assignment deadline column over dates in other columns', () => {
    const dom = new JSDOM(`
      <table><tbody><tr>
        <td><a href="${DETAIL_URL}">Entrega de ensayo</a></td>
        <td aria-describedby="workList_expires_on" title="12/10/2026 23:45">12/10/2026 23:45</td>
        <td aria-describedby="workList_last_upload">2026-09-30 07:00:00</td>
      </tr></tbody></table>
    `);

    expect(parseChamiloAssignments(dom.window.document, COURSE, LIST_URL)[0]?.dueAt)
      .toBe('2026-10-12T23:45:00');
  });

  it('reads a deadline from the assignment title when the deadline cell is absent', () => {
    const dom = new JSDOM(`
      <table><tbody><tr>
        <td><a href="${DETAIL_URL}">TAREA 3 - FECHA LIMITE 5 DE OCTUBRE DE 2026</a></td>
        <td aria-describedby="workList_feedback"></td>
      </tr></tbody></table>
    `);

    expect(parseChamiloAssignments(dom.window.document, COURSE, LIST_URL)[0]?.dueAt)
      .toBe('2026-10-05');
  });

  it('does not treat the last-upload date as a deadline', () => {
    const dom = new JSDOM(`
      <table><tbody><tr>
        <td><a href="${DETAIL_URL}">Entrega de ensayo</a></td>
        <td aria-describedby="workList_expires_on">Sin fecha</td>
        <td aria-describedby="workList_last_upload">2026-09-30 07:00:00</td>
      </tr></tbody></table>
    `);
    expect(parseChamiloAssignments(dom.window.document, COURSE, LIST_URL)[0]?.dueAt)
      .toBeUndefined();
  });

  it('reads a deadline when a td contains the label instead of a th', () => {
    const dom = new JSDOM(`
      <html><body><h3>Entrega de ensayo</h3>
        <table><tbody><tr><td>Fecha de entrega:</td><td>12/10/2026 23:45</td></tr></tbody></table>
      </body></html>
    `);
    expect(parseChamiloAssignmentDetail(dom.window.document, COURSE, DETAIL_URL)?.dueAt)
      .toBe('2026-10-12T23:45:00');
  });

  it('does not use an unrelated date when assignment details have no labeled deadline', () => {
    const dom = new JSDOM(`
      <html><body><h3>Entrega de ensayo</h3>
        <table><tbody><tr><th>Última entrega</th><td>2026-09-30 07:00:00</td></tr></tbody></table>
      </body></html>
    `);
    expect(parseChamiloAssignmentDetail(dom.window.document, COURSE, DETAIL_URL)?.dueAt)
      .toBeUndefined();
  });

  it('reads a hidden expires_on field from assignment details', () => {
    const dom = new JSDOM(`
      <html><body><h3>Entrega de ensayo</h3>
        <input type="hidden" name="expires_on" value="2026-10-18 22:30:00">
      </body></html>
    `);

    expect(parseChamiloAssignmentDetail(dom.window.document, COURSE, DETAIL_URL)?.dueAt)
      .toBe('2026-10-18T22:30:00');
  });

  it('reads a deadline embedded in Chamilo script data', () => {
    const dom = new JSDOM(`
      <html><body><h3>Entrega de ensayo</h3>
        <script>
          window.assignment = {"id":"2074726","expires_on":"2026-10-20 21:15:00"};
        </script>
      </body></html>
    `);

    expect(parseChamiloAssignmentDetail(dom.window.document, COURSE, DETAIL_URL)?.dueAt)
      .toBe('2026-10-20T21:15:00');
  });

  it('reports only deadline-related diagnostic candidates', () => {
    const dom = new JSDOM(`
      <html><body>
        <input name="expires_on" value="2026-10-18 22:30:00">
        <input name="unrelated_date" value="2026-01-01 08:00:00">
      </body></html>
    `);

    expect(inspectChamiloAssignmentDeadline(dom.window.document)).toEqual({
      candidates: ['2026-10-18 22:30:00'],
      normalized: ['2026-10-18T22:30:00'],
    });
  });

  it('reads a labeled deadline from assignment details', () => {
    const dom = new JSDOM(`
      <html><body><h3>Entrega de ensayo</h3>
        <table><tbody><tr><th>Fecha límite</th><td>12 de octubre de 2026 a las 11:45 pm</td></tr></tbody></table>
      </body></html>
    `);
    expect(parseChamiloAssignmentDetail(dom.window.document, COURSE, DETAIL_URL)?.dueAt)
      .toBe('2026-10-12T23:45:00');
  });
});

describe('Chamilo deadline priority', () => {
  const listed = {
    externalId: '2074726',
    courseExternalId: COURSE.externalId,
    title: 'TAREA 3 - FECHA LIMITE 5 DE OCTUBRE DE 2026',
    sourceUrl: DETAIL_URL,
  };

  const agendaEvent = {
    courseExternalId: COURSE.externalId,
    title: 'Entrega de tarea TAREA 3',
    startsAt: '2026-10-07T23:59:00',
    allDay: false,
    sourceType: 'assignment' as const,
    sourceExternalId: '2074726',
    sourceUrl: DETAIL_URL,
  };

  it('marks a deadline read from the title', () => {
    const dom = new JSDOM(`
      <table><tbody><tr>
        <td><a href="${DETAIL_URL}">${listed.title}</a></td>
      </tr></tbody></table>
    `);

    expect(parseChamiloAssignments(dom.window.document, COURSE, LIST_URL)[0]).toMatchObject({
      dueAt: '2026-10-05',
      dueAtSource: 'title',
    });
  });

  it('lets a stored detail deadline replace a title date from the list', () => {
    const merged = mergeChamiloAssignmentDetail(
      { ...listed, dueAt: '2026-10-05', dueAtSource: 'title' },
      { ...listed, dueAt: '2026-10-06T23:00:00', dueAtSource: 'campus', hasSubmission: false },
    );

    expect(merged).toMatchObject({ dueAt: '2026-10-06T23:00:00', dueAtSource: 'campus' });
  });

  it('keeps the list deadline when both pages store one', () => {
    const merged = mergeChamiloAssignmentDetail(
      { ...listed, dueAt: '2026-10-06T23:00:00', dueAtSource: 'campus' },
      { ...listed, dueAt: '2026-10-08T23:00:00', dueAtSource: 'campus' },
    );

    expect(merged.dueAt).toBe('2026-10-06T23:00:00');
  });

  it('keeps the title date when nothing else is available', () => {
    const merged = mergeChamiloAssignmentDetail(
      { ...listed, dueAt: '2026-10-05', dueAtSource: 'title' },
      { ...listed, description: 'Leer el capítulo 2' },
    );

    expect(merged).toMatchObject({
      dueAt: '2026-10-05',
      dueAtSource: 'title',
      description: 'Leer el capítulo 2',
    });
  });

  it('leaves the deadline empty when the campus exposes none', () => {
    const merged = mergeChamiloAssignmentDetail(
      { ...listed, title: 'Entrega de ensayo' },
      { ...listed, title: 'Entrega de ensayo' },
    );

    expect(merged.dueAt).toBeUndefined();
    expect(mergeChamiloAssignmentDeadlines([merged], [])[0]?.dueAt).toBeUndefined();
  });

  it('prefers the agenda deadline over a date read from the title', () => {
    const [assignment] = mergeChamiloAssignmentDeadlines(
      [{ ...listed, dueAt: '2026-10-05', dueAtSource: 'title' }],
      [agendaEvent],
    );

    expect(assignment).toMatchObject({ dueAt: '2026-10-07T23:59:00', dueAtSource: 'campus' });
  });

  it('ignores agenda events linked to another assignment', () => {
    const [assignment] = mergeChamiloAssignmentDeadlines(
      [{ ...listed, title: 'Entrega de ensayo' }],
      [{ ...agendaEvent, sourceExternalId: '999' }],
    );

    expect(assignment?.dueAt).toBeUndefined();
  });
});
