import type {
  CampusScheduleSuggestion,
  CampusSyncSnapshot,
  Modality,
  TimeOfDay,
  Weekday,
} from '@pulse/types';

const DAY_NAMES: ReadonlyArray<{ value: Weekday; pattern: RegExp }> = [
  { value: 1, pattern: /\blunes\b/i },
  { value: 2, pattern: /\bmartes\b/i },
  { value: 3, pattern: /\bmi[eé]rcoles\b/i },
  { value: 4, pattern: /\bjueves\b/i },
  { value: 5, pattern: /\bviernes\b/i },
  { value: 6, pattern: /\bs[aá]bado\b/i },
  { value: 7, pattern: /\bdomingo\b/i },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function parseClock(hourText: string, minuteText: string | undefined, period?: string): TimeOfDay | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? '0');

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;

  const normalizedPeriod = period?.toLowerCase().replace(/\./g, '');

  if (normalizedPeriod) {
    if (hour < 1 || hour > 12) return null;
    if (normalizedPeriod === 'pm' && hour !== 12) hour += 12;
    if (normalizedPeriod === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` as TimeOfDay;
}

function timeRange(value: string): { start: TimeOfDay; end: TimeOfDay } | null {
  const match = value.match(
    /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|a|hasta)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i,
  );

  if (!match) return null;

  const startPeriod = match[3] ?? match[6];
  const endPeriod = match[6] ?? match[3];
  const start = parseClock(match[1]!, match[2], startPeriod);
  const end = parseClock(match[4]!, match[5], endPeriod);

  if (!start || !end || start >= end) return null;
  return { start, end };
}

function modalityFromText(value: string): Modality {
  const normalized = normalize(value);

  if (/\b(hibrid|semipresencial)\b/.test(normalized)) return 'hybrid';
  if (/\b(virtual|en linea|online|meet|zoom|teams)\b/.test(normalized)) return 'virtual';
  if (/\b(presencial|aula|salon|edificio)\b/.test(normalized)) return 'in_person';
  return 'unconfirmed';
}

function weekdaysFromText(value: string): Weekday[] {
  return DAY_NAMES.filter((day) => day.pattern.test(value)).map((day) => day.value);
}

function firstMeetingUrl(snapshot: CampusSyncSnapshot): string | null {
  const explicit = snapshot.course.meetingUrls?.[0];
  if (explicit) return explicit;

  for (const announcement of snapshot.announcements) {
    const content = `${announcement.title}\n${announcement.content ?? ''}`;
    const match = content.match(
      /https:\/\/(?:meet\.google\.com\/[^\s<]+|[^\s<]*zoom\.us\/[^\s<]+|teams\.microsoft\.com\/[^\s<]+)/i,
    );
    if (match?.[0]) return match[0];
  }

  return null;
}

function eventSuggestions(snapshot: CampusSyncSnapshot): CampusScheduleSuggestion[] {
  const groups = new Map<string, { count: number; weekday: Weekday; start: TimeOfDay; end: TimeOfDay }>();

  for (const event of snapshot.events) {
    if (event.sourceType !== 'agenda' || event.allDay || !event.endsAt) continue;

    const start = event.startsAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    const end = event.endsAt.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/);
    if (!start || !end || start[2]! >= end[1]!) continue;

    const day = new Date(`${start[1]}T00:00:00Z`).getUTCDay();
    const weekday = (day === 0 ? 7 : day) as Weekday;
    const key = `${weekday}|${start[2]}|${end[1]}`;
    const current = groups.get(key);

    groups.set(key, {
      count: (current?.count ?? 0) + 1,
      weekday,
      start: start[2] as TimeOfDay,
      end: end[1] as TimeOfDay,
    });
  }

  return [...groups.values()]
    .filter((group) => group.count >= 3)
    .map((group) => ({
      weekdays: [group.weekday],
      startTime: group.start,
      endTime: group.end,
      modality: 'unconfirmed' as const,
      meetingUrl: null,
      confidence: 'medium' as const,
      evidence: `${group.count} eventos del campus repiten este horario.`,
      source: 'agenda' as const,
    }));
}

export function inferCampusScheduleSuggestions(
  snapshot: CampusSyncSnapshot,
): CampusScheduleSuggestion[] {
  const suggestions: CampusScheduleSuggestion[] = [];
  const meetingUrl = firstMeetingUrl(snapshot);

  for (const hint of snapshot.course.scheduleHints ?? []) {
    const weekdays = weekdaysFromText(hint);
    const range = timeRange(hint);

    if (weekdays.length === 0 || !range) continue;

    const normalized = normalize(hint);
    const explicitSchedule = /\b(horario|clase|clases)\b/.test(normalized);

    suggestions.push({
      weekdays,
      startTime: range.start,
      endTime: range.end,
      modality: modalityFromText(hint),
      meetingUrl,
      confidence: explicitSchedule ? 'high' : 'medium',
      evidence: hint,
      source: 'campus_text',
    });
  }

  for (const suggestion of eventSuggestions(snapshot)) {
    const duplicate = suggestions.some(
      (existing) =>
        existing.startTime === suggestion.startTime &&
        existing.endTime === suggestion.endTime &&
        existing.weekdays.some((day) => suggestion.weekdays.includes(day)),
    );
    if (!duplicate) suggestions.push(suggestion);
  }

  return suggestions.slice(0, 5);
}
