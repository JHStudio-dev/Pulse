import { describe, expect, it } from 'vitest';
import { inferCampusScheduleSuggestions } from './schedule';

describe('campus schedule suggestions', () => {
  it('extracts weekdays, times and modality from campus text', () => {
    const suggestions = inferCampusScheduleSuggestions({
      course: {
        externalId: 'ADM2011C1',
        scheduleHints: ['Horario de clases: lunes y miércoles 6:00 pm - 7:30 pm virtual'],
        meetingUrls: ['https://meet.google.com/abc-defg-hij'],
      },
      documents: [],
      assignments: [],
      announcements: [],
      events: [],
    });

    expect(suggestions[0]).toMatchObject({
      weekdays: [1, 3],
      startTime: '18:00',
      endTime: '19:30',
      modality: 'virtual',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      confidence: 'high',
    });
  });

  it('returns no suggestion when the campus text has no complete time range', () => {
    const suggestions = inferCampusScheduleSuggestions({
      course: {
        externalId: 'ADM2011C1',
        scheduleHints: ['Clases los lunes por la tarde'],
      },
      documents: [],
      assignments: [],
      announcements: [],
      events: [],
    });

    expect(suggestions).toEqual([]);
  });
});
