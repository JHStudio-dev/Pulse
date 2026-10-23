'use client';

import type { CampusScheduleSuggestion, Modality, Weekday } from '@pulse/types';
import type { ScheduleDraft } from '@/lib/campus-import';

const DAY_LABELS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const MODALITY_LABELS: Record<Modality, string> = {
  unconfirmed: 'Modalidad sin confirmar',
  virtual: 'Virtual',
  in_person: 'Presencial',
  hybrid: 'Híbrida',
};

const FIELD =
  'mt-1 block w-full rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1.5';

export function describeScheduleDraft(draft: ScheduleDraft): string {
  const days = DAY_LABELS.filter((day) => draft.weekdays.includes(day.value))
    .map((day) => day.label)
    .join(', ');

  return [days || 'Sin días', `${draft.startTime}–${draft.endTime}`, MODALITY_LABELS[draft.modality]].join(
    ' · ',
  );
}

/**
 * A detected schedule awaiting the student's decision.
 *
 * Nothing is saved unless "Guardar este horario" is checked; the fields are
 * the campus guess and stay editable until the import runs.
 */
export function ScheduleReview({
  id,
  suggestion,
  draft,
  confirmed,
  disabled,
  onConfirmChange,
  onDraftChange,
}: {
  id: string;
  suggestion: CampusScheduleSuggestion;
  draft: ScheduleDraft;
  confirmed: boolean;
  disabled: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  onDraftChange: (changes: Partial<ScheduleDraft>) => void;
}) {
  return (
    <div className="mt-3 border-l border-[color:var(--color-border)] pl-3">
      <p className="text-xs">
        <span className="font-medium">Horario detectado</span>
        <span className="text-[color:var(--color-ink-muted)]">
          {' · '}confianza {suggestion.confidence === 'high' ? 'alta' : 'media'}
        </span>
      </p>
      <p className="mt-1 text-xs">{describeScheduleDraft(draft)}</p>
      {draft.meetingUrl ? (
        <p className="text-[color:var(--color-ink-muted)] mt-0.5 truncate text-xs">{draft.meetingUrl}</p>
      ) : null}
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
        Evidencia: <q>{suggestion.evidence}</q>
      </p>

      <label className="mt-2 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          onChange={(event) => onConfirmChange(event.target.checked)}
        />
        Guardar este horario
      </label>

      {confirmed ? (
        <div className="mt-3 grid gap-3">
          <fieldset>
            <legend className="text-xs font-medium">Días</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {DAY_LABELS.map((day) => {
                const checked = draft.weekdays.includes(day.value);

                return (
                  <label key={day.value} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() =>
                        onDraftChange({
                          weekdays: checked
                            ? draft.weekdays.filter((value) => value !== day.value)
                            : [...draft.weekdays, day.value].sort(),
                        })
                      }
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs" htmlFor={`${id}-start`}>
              Inicio
              <input
                id={`${id}-start`}
                type="time"
                value={draft.startTime}
                disabled={disabled}
                onChange={(event) => onDraftChange({ startTime: event.target.value })}
                className={FIELD}
              />
            </label>
            <label className="text-xs" htmlFor={`${id}-end`}>
              Fin
              <input
                id={`${id}-end`}
                type="time"
                value={draft.endTime}
                disabled={disabled}
                onChange={(event) => onDraftChange({ endTime: event.target.value })}
                className={FIELD}
              />
            </label>
          </div>

          <label className="text-xs" htmlFor={`${id}-modality`}>
            Modalidad
            <select
              id={`${id}-modality`}
              value={draft.modality}
              disabled={disabled}
              onChange={(event) => onDraftChange({ modality: event.target.value as Modality })}
              className={FIELD}
            >
              <option value="unconfirmed">Sin confirmar</option>
              <option value="virtual">Virtual</option>
              <option value="in_person">Presencial</option>
              <option value="hybrid">Híbrida</option>
            </select>
          </label>

          <label className="text-xs" htmlFor={`${id}-url`}>
            Enlace de clase
            <input
              id={`${id}-url`}
              type="url"
              value={draft.meetingUrl}
              disabled={disabled}
              onChange={(event) => onDraftChange({ meetingUrl: event.target.value })}
              placeholder="Opcional"
              className={FIELD}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
