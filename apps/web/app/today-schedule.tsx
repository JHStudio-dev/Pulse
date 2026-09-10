import type { ClassSession, Subject, SubjectId } from '@pulse/types';
import { MODALITY_LABEL } from '@/lib/format';

/**
 * Today's classes, in order.
 *
 * State is carried by a text label as well as weight, so "already finished" is
 * readable without distinguishing colours.
 */

type SessionState = 'done' | 'now' | 'later';

function stateOf(session: ClassSession, nowMinutes: number, isToday: boolean): SessionState {
  if (!isToday) return 'later';
  const [startH = 0, startM = 0] = session.startTime.split(':').map(Number);
  const [endH = 0, endM = 0] = session.endTime.split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  if (nowMinutes >= end) return 'done';
  if (nowMinutes >= start) return 'now';
  return 'later';
}

const STATE_LABEL: Record<SessionState, string> = {
  done: 'Finalizada',
  now: 'En curso',
  later: '',
};

export function TodaySchedule({
  sessions,
  subjectsById,
  nowMinutes,
}: {
  sessions: readonly ClassSession[];
  subjectsById: ReadonlyMap<SubjectId, Subject>;
  nowMinutes: number;
}) {
  return (
    <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
      {sessions.map((session) => {
        const state = session.status === 'cancelled' ? 'done' : stateOf(session, nowMinutes, true);
        const subject = subjectsById.get(session.subjectId);
        const label = session.status === 'cancelled' ? 'Cancelada' : STATE_LABEL[state];

        return (
          <li
            key={session.id}
            className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 ${
              state === 'done' ? 'text-[color:var(--color-ink-muted)]' : ''
            }`}
          >
            <span className="font-mono text-xs tabular-nums">{session.startTime}</span>

            <span className={state === 'now' ? 'text-sm font-medium' : 'text-sm'}>
              {subject?.name ?? 'Materia'}
            </span>

            <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
              {label.length > 0 ? `${label} · ` : ''}
              {MODALITY_LABEL[session.modality]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
