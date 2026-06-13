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
 */
export function useRecord<T extends Model>(record: T): T {
  const [value, setValue] = useState<T>(record);

  useEffect(() => {
    const subscription = record.observe().subscribe((nextVal) => {
      setValue(nextVal);
    });
    return () => subscription.unsubscribe();
  }, [record]);

  return value;
}

/**
 * Reactively subscribes to updates on a WatermelonDB Relation field.
 */
export function useRelation<T extends Model>(relation: Relation<T>): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    const subscription = relation.observe().subscribe((nextVal: T | null) => {
      setValue(nextVal);
    });
    return () => subscription.unsubscribe();
  }, [relation]);

  return value;
}
