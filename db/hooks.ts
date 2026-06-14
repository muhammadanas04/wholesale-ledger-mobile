import { useEffect, useState } from 'react';
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
export function useRelation<T extends Model>(relation: Relation<T> | null | undefined): T | null {
  const [value, setValue] = useState<T | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!relation) {
      setValue(null);
      return;
    }
    const subscription = relation.observe().subscribe((nextVal: T | null) => {
      setValue(nextVal);
      setTick((t) => t + 1);
    });
    return () => subscription.unsubscribe();
  }, [relation]);

  return value;
}
