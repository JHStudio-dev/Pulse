import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  getChamiloCourseId,
  getChamiloDirectoryPath,
  getChamiloDocumentId,
  getChamiloSessionId,
  parseChamiloDocuments,
  sanitizeCampusUrl,
  parseChamiloAssignments,
  getChamiloAssignmentId,
  parseChamiloAssignmentDetail,
} from './chamilo.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

describe('Chamilo URLs', () => {
  it('reads a course id from a course page', () => {
    expect(
      getChamiloCourseId('https://campus.ujcv.edu.hn/courses/ADM2011C1/index.php?id_session=0'),
    ).toBe('ADM2011C1');
  });

  it('reads a course id from cidReq', () => {
    expect(
      getChamiloCourseId(
        'https://campus.ujcv.edu.hn/main/work/work.php?cidReq=ADM2011C1&id_session=0',
      ),
    ).toBe('ADM2011C1');
  });

  it('reads the session id', () => {
    expect(
      getChamiloSessionId('https://campus.ujcv.edu.hn/courses/ADM2011C1/index.php?id_session=0'),
    ).toBe('0');
  });

  it('removes temporary session values', () => {
    const result = sanitizeCampusUrl(
      'https://campus.ujcv.edu.hn/main/document/document.php?cidReq=ADM2011C1&sec_token=secret&hash=temp',
      'https://campus.ujcv.edu.hn',
    );

    expect(result).toContain('cidReq=ADM2011C1');
    expect(result).not.toContain('sec_token');
    expect(result).not.toContain('hash');
  });
});

describe('Chamilo documents', () => {
  it('reads a document id', () => {
    expect(
      getChamiloDocumentId(
        'https://campus.ujcv.edu.hn/main/document/showinframes.php?cidReq=ADM2011C1&id=688913',
      ),
    ).toBe('688913');
  });

  it('reads a folder id', () => {
    expect(
      getChamiloDocumentId(
        'https://campus.ujcv.edu.hn/main/document/document.php?cidReq=ADM2011C1&id=688912',
      ),
    ).toBe('688912');
  });

  it('reads the logical folder path', () => {
    expect(
      getChamiloDirectoryPath(
        'https://campus.ujcv.edu.hn/main/document/document.php?cidReq=ADM2011C1&curdirpath=%2FPRIMER-PARCIAL&id=688912',
      ),
    ).toBe('/PRIMER-PARCIAL');
  });
});

describe('Chamilo document parser', () => {
  it('parses the real UJCV document table', () => {
    const fixtureUrl = new URL('../fixtures/chamilo-documents-root.html', import.meta.url);

    const html = readFileSync(fileURLToPath(fixtureUrl), 'utf8');
    const dom = new JSDOM(html, {
      url: 'https://campus.ujcv.edu.hn/main/document/document.php?cidReq=ADM2011C1&id_session=0',
    });

    const documents = parseChamiloDocuments(
      dom.window.document,
      {
        externalId: 'ADM2011C1',
        sessionId: '0',
      },
      dom.window.location.href,
    );

    expect(documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: '688912',
          courseExternalId: 'ADM2011C1',
          name: 'CARPETA 1ER. PARCIAL',
          kind: 'folder',
        }),
        expect.objectContaining({
          externalId: '689126',
          courseExternalId: 'ADM2011C1',
          kind: 'file',
        }),
      ]),
    );
  });
});
it('parses a real nested UJCV document folder', () => {
  const fixtureUrl = new URL('../fixtures/chamilo-documents-first-partial.html', import.meta.url);

  const html = readFileSync(fileURLToPath(fixtureUrl), 'utf8');

  const dom = new JSDOM(html, {
    url:
      'https://campus.ujcv.edu.hn/main/document/document.php' +
      '?cidReq=ADM2011C1&id_session=0&curdirpath=%2FPRIMER-PARCIAL&id=688912',
  });

  const documents = parseChamiloDocuments(
    dom.window.document,
    {
      externalId: 'ADM2011C1',
      sessionId: '0',
    },
    dom.window.location.href,
  );

  expect(documents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        externalId: '688913',
        courseExternalId: 'ADM2011C1',
        name: '01. INTRODUCCIÓN A LA ADMINISTRACIÓN',
        kind: 'file',
        path: '/PRIMER-PARCIAL',
      }),
    ]),
  );
});

describe('Chamilo assignments', () => {
  it('reads an assignment id', () => {
    expect(
      getChamiloAssignmentId(
        'https://campus.ujcv.edu.hn/main/work/work_list.php?cidReq=ADM2011C1&id=2074726',
      ),
    ).toBe('2074726');
  });

  it('parses the real UJCV assignment list', () => {
    const fixtureUrl = new URL('../fixtures/chamilo-assignments.html', import.meta.url);

    const html = readFileSync(fileURLToPath(fixtureUrl), 'utf8');

    const dom = new JSDOM(html, {
      url: 'https://campus.ujcv.edu.hn/main/work/work.php?cidReq=ADM2011C1&id_session=0',
    });

    const assignments = parseChamiloAssignments(
      dom.window.document,
      {
        externalId: 'ADM2011C1',
        sessionId: '0',
      },
      dom.window.location.href,
    );

    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: '2074726',
          courseExternalId: 'ADM2011C1',
          title: 'Estudio de Caso 01. Proyecto Oxigeno Google',
          dueAt: '2026-10-12T23:45:00',
        }),
      ]),
    );
  });
});

describe('Chamilo assignment detail', () => {
  it('parses the real UJCV assignment detail', () => {
    const fixtureUrl = new URL('../fixtures/chamilo-assignment-detail.html', import.meta.url);

    const html = readFileSync(fileURLToPath(fixtureUrl), 'utf8');

    const dom = new JSDOM(html, {
      url:
        'https://campus.ujcv.edu.hn/main/work/work_list.php' +
        '?cidReq=ADM2011C1&id_session=0&id=2074726',
    });

    const assignment = parseChamiloAssignmentDetail(
      dom.window.document,
      {
        externalId: 'ADM2011C1',
        sessionId: '0',
      },
      dom.window.location.href,
    );

    expect(assignment).toEqual(
      expect.objectContaining({
        externalId: '2074726',
        courseExternalId: 'ADM2011C1',
        title: 'Estudio de Caso 01. Proyecto Oxigeno Google',
        hasSubmission: false,
      }),
    );

    expect(assignment?.description).toContain('Google y la evolución del liderazgo');

    expect(assignment?.submissionUrl).toContain('/main/work/upload.php');
  });
});
