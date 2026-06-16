import { useEffect, useState, useRef } from 'react';
import { Model, Query, Relation } from '@nozbe/watermelondb';

/**
 * Reactively subscribes to a WatermelonDB query.
 * IMPORTANT: Ensure the query reference is stable (e.g. wrapped in useMemo)
 * so that subscription setup does not trigger on every render.
 */
export function useQuery<T extends Model>(query: Query<T>): T[] {
  const [value, setValue] = useState<T[]>([]);

  useEffect(() => {
    const subscription = query.observe().subscribe((nextVal) => {
      setValue(nextVal);
    });
    return () => subscription.unsubscribe();
  }, [query]);

  return value;
}

/**
 * Reactively subscribes to updates on a single WatermelonDB record instance.
 * Uses a tick counter to force re-render since WatermelonDB updates records in-place.
 */
export function useRecord<T extends Model>(record: T): T {
  const [, setTick] = useState(0);

  useEffect(() => {
    const subscription = record.observe().subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => subscription.unsubscribe();
  }, [record]);

  return record;
}

/**
 * Reactively subscribes to updates on a WatermelonDB Relation field.
 * Safely handles null/undefined relation arguments.
 * Uses a tick counter to force re-render when the target record updates in-place.
 */
export function useRelation<T extends Model>(
  relation: Relation<T> | null | undefined
): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  const [, setTick] = useState(0);

  const subscriptionRef = useRef<{
    relationId: string | undefined;
    modelId: string | undefined;
    subscription: any;
  } | null>(null);

  const relationId = relation?.id;
  const modelId = (relation as any)?._model?.id;

  useEffect(() => {
    // If we are already observing this relation on this model instance, do nothing
    if (
      subscriptionRef.current &&
      subscriptionRef.current.relationId === relationId &&
      subscriptionRef.current.modelId === modelId
    ) {
      return;
    }

    // Unsubscribe from previous relation if any
    if (subscriptionRef.current?.subscription) {
      subscriptionRef.current.subscription.unsubscribe();
      subscriptionRef.current = null;
    }

    if (!relation) {
      setValue(null);
      return;
    }

    // Set to undefined (loading) when target change is initiated
    setValue(undefined);

    const subscription = relation.observe().subscribe({
      next: (nextVal: T | null) => {
        setValue(nextVal);
        setTick((t) => t + 1);
      },
      error: (err) => {
        console.error(`[useRelation] Error observing relation ${relationId}:`, err);
        setValue(null); // Fallback to null on error (e.g. record not found in DB)
      },
    });

    subscriptionRef.current = {
      relationId,
      modelId,
      subscription,
    };
  }, [relationId, modelId]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current?.subscription) {
        subscriptionRef.current.subscription.unsubscribe();
      }
    };
  }, []);

  return value;
}

