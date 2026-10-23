import { describe, expect, it } from 'vitest';
import { inferCampusScheduleSuggestions, missingScheduleWeekdays } from './schedule';

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

describe('confirmed campus schedules', () => {
  const existing = [
    { weekday: 1 as const, startTime: '18:00', endTime: '19:30' },
    { weekday: 3 as const, startTime: '18:00', endTime: '19:30' },
  ];

  it('skips slots that already exist', () => {
    expect(
      missingScheduleWeekdays(existing, { weekdays: [1, 3], startTime: '18:00', endTime: '19:30' }),
    ).toEqual([]);
  });

  it('adds only the new weekdays', () => {
    expect(
      missingScheduleWeekdays(existing, { weekdays: [1, 3, 5], startTime: '18:00', endTime: '19:30' }),
    ).toEqual([5]);
  });

  it('treats a different time on the same day as a new slot', () => {
    expect(
      missingScheduleWeekdays(existing, { weekdays: [1], startTime: '18:00', endTime: '19:40' }),
    ).toEqual([1]);
  });

  it('ignores repeated weekdays in the request', () => {
    expect(
      missingScheduleWeekdays([], { weekdays: [2, 2, 4], startTime: '07:00', endTime: '08:30' }),
    ).toEqual([2, 4]);
  });

  it('compares stored times with seconds', () => {
    expect(
      missingScheduleWeekdays(
        [{ weekday: 2, startTime: '07:00:00', endTime: '08:30:00' }],
        { weekdays: [2], startTime: '07:00', endTime: '08:30' },
      ),
    ).toEqual([]);
  });
});
