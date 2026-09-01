import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncError {
  message: string;
}

export interface AsyncDataState<T> {
  data: T;
  loading: boolean;
  error: AsyncError | null;
}

export interface AsyncDataResult<T> extends AsyncDataState<T> {
  retry: () => void;
  // Escape hatch for an optimistic local mutation (e.g. marking one item read)
  // that shouldn't require a full refetch-and-reload cycle to reflect.
  setData: (updater: T | ((prev: T) => T)) => void;
}

function toAsyncError(err: unknown): AsyncError {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return { message: (err as { message: string }).message };
  }
  return { message: "Something went wrong." };
}

/**
 * Wraps an async loader with loading/error/retry state so a failed fetch
 * doesn't collapse into an empty/null result with no trace of what went
 * wrong. The loader must throw (or return a rejected promise) on failure --
 * translate a Supabase `{ data, error }` response into that by throwing
 * `error` when present, once, at the loader's own boundary:
 *
 *   useAsyncData(async () => {
 *     const { data, error } = await supabase.from("t").select("*");
 *     if (error) throw error;
 *     return data ?? [];
 *   }, [dep], [])
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[], initialData: T): AsyncDataResult<T> {
  const [state, setState] = useState<AsyncDataState<T>>({ data: initialData, loading: true, error: null });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // useCallback's second argument must be an array *literal* for the
  // React Compiler-era lint rule to accept it at all -- it can't statically
  // verify a variable spread. Collapsing the caller's own dependency list
  // into one string keeps the array literal shape (`[depsKey]`) while still
  // changing identity exactly when any real dependency does.
  const depsKey = JSON.stringify(deps);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    return loader().then(
      (data) => {
        if (mountedRef.current) setState({ data, loading: false, error: null });
      },
      (err) => {
        if (mountedRef.current) setState((prev) => ({ ...prev, loading: false, error: toAsyncError(err) }));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback((updater: T | ((prev: T) => T)) => {
    setState((prev) => ({
      ...prev,
      data: typeof updater === "function" ? (updater as (prev: T) => T)(prev.data) : updater,
    }));
  }, []);

  return { ...state, retry: load, setData };
}
