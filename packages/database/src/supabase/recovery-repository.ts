import type {
  ClassSessionId,
  RecoveryItem,
  RecoveryItemId,
  RecoveryItemKind,
  RecoveryPlan,
  RecoveryPlanId,
  UserId,
} from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { RecoveryRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toRecoveryItem, toRecoveryPlan } from './mappers';
import type { RecoveryItemRow, RecoveryPlanRow } from './rows';

/** Wording for each step. The domain returns kinds; the labels live here. */
const ITEM_LABEL: Record<RecoveryItemKind, string> = {
  review_material: 'Revisar el material publicado',
  get_notes: 'Conseguir apuntes de la clase',
  confirm_topics: 'Confirmar los temas que se vieron',
  check_new_dates: 'Revisar tareas y fechas nuevas',
  practice: 'Resolver ejercicios o lectura',
  ask_question: 'Anotar las dudas que queden',
};

export function createRecoveryRepository(client: PulseSupabaseClient): RecoveryRepository {
  return {
    async findBySession(userId: UserId, sessionId: ClassSessionId): Promise<RecoveryPlan | null> {
      const { data, error } = await client
        .from('recovery_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('class_session_id', sessionId)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toRecoveryPlan(data as RecoveryPlanRow) : null;
    },

    async listByUser(userId: UserId): Promise<RecoveryPlan[]> {
      const { data, error } = await client
        .from('recovery_plans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as RecoveryPlanRow[]).map(toRecoveryPlan);
    },

    async listItems(userId: UserId, planId: RecoveryPlanId): Promise<RecoveryItem[]> {
      const { data, error } = await client
        .from('recovery_items')
        .select('*')
        .eq('user_id', userId)
        .eq('recovery_plan_id', planId)
        .order('position');

      if (error) throw translateError(error);
      return (data as RecoveryItemRow[]).map(toRecoveryItem);
    },

    /**
     * Creates a plan with its steps.
     *
     * The step list comes from the domain, which decides what a missed class
     * needs based on whether the student was partly present.
     */
    async create(
      userId: UserId,
      sessionId: ClassSessionId,
      items: ReadonlyArray<{ kind: RecoveryItemKind; position: number }>,
    ): Promise<RecoveryPlan> {
      const { data, error } = await client
        .from('recovery_plans')
        .insert({ user_id: userId, class_session_id: sessionId })
        .select()
        .single();

      if (error) throw translateError(error);
      const plan = toRecoveryPlan(data as RecoveryPlanRow);

      if (items.length > 0) {
        const { error: itemError } = await client.from('recovery_items').insert(
          items.map((item) => ({
            user_id: userId,
            recovery_plan_id: plan.id,
            kind: item.kind,
            label: ITEM_LABEL[item.kind],
            position: item.position,
          })),
        );

        if (itemError) {
          // Do not leave a plan with no steps behind.
          await client.from('recovery_plans').delete().eq('id', plan.id);
          throw translateError(itemError);
        }
      }

      return plan;
    },

    async setItemDone(userId: UserId, itemId: RecoveryItemId, done: boolean): Promise<void> {
      const { error } = await client
        .from('recovery_items')
        .update({ done })
        .eq('user_id', userId)
        .eq('id', itemId);

      if (error) throw translateError(error);
    },

    async setStatus(
      userId: UserId,
      planId: RecoveryPlanId,
      status: RecoveryPlan['status'],
    ): Promise<RecoveryPlan> {
      const { data, error } = await client
        .from('recovery_plans')
        .update({
          status,
          completed_at: status === 'recovered' ? new Date().toISOString() : null,
        })
        .eq('user_id', userId)
        .eq('id', planId)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Recovery plan ${planId} not found`);
      return toRecoveryPlan(data as RecoveryPlanRow);
    },

    async remove(userId: UserId, planId: RecoveryPlanId): Promise<void> {
      const { error } = await client
        .from('recovery_plans')
        .delete()
        .eq('user_id', userId)
        .eq('id', planId);

      if (error) throw translateError(error);
    },
  };
}
