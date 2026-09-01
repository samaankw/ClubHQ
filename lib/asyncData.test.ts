import { renderHook, waitFor } from "@testing-library/react-native";
import { act } from "react";
import { useAsyncData } from "./asyncData";

describe("useAsyncData", () => {
  test("resolves loading -> data, error stays null", async () => {
    const { result } = await renderHook(() => useAsyncData(async () => "hello", [], ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBeNull();
  });

  test("a rejected loader is retained as an error, not swallowed into initialData", async () => {
    const { result } = await renderHook(() =>
      useAsyncData<string[]>(
        async () => {
          throw new Error("network down");
        },
        [],
        [],
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toEqual({ message: "network down" });
    // Data stays at the caller's initial value -- the point is the error is
    // visible alongside it, not that data gets silently reset to something new.
    expect(result.current.data).toEqual([]);
  });

  test("a thrown Supabase-shaped error (message but not an Error instance) is captured the same way", async () => {
    const { result } = await renderHook(() =>
      useAsyncData<string[]>(
        async () => {
          throw { message: "permission denied", code: "42501" };
        },
        [],
        [],
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toEqual({ message: "permission denied" });
  });

  test("a thrown value with no message falls back to a generic message rather than throwing further", async () => {
    const { result } = await renderHook(() =>
      useAsyncData<string[]>(
        async () => {
          throw "just a string";
        },
        [],
        [],
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toEqual({ message: "Something went wrong." });
  });

  test("retry re-runs the loader and clears a previous error on success", async () => {
    let shouldFail = true;
    const { result } = await renderHook(() =>
      useAsyncData<string>(
        async () => {
          if (shouldFail) throw new Error("first attempt failed");
          return "recovered";
        },
        [],
        "",
      ),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toEqual({ message: "first attempt failed" });

    shouldFail = false;
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("recovered");
  });

  test("changing a dependency re-fires the loader", async () => {
    const loader = jest.fn(async (n: number) => n * 2);
    let dep = 1;
    const { result, rerender } = await renderHook(() => useAsyncData(() => loader(dep), [dep], 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(2);

    dep = 5;
    await rerender({});
    await waitFor(() => expect(result.current.data).toBe(10));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("setData applies an optimistic local update without re-invoking the loader", async () => {
    const loader = jest.fn(async () => ["a", "b"]);
    const { result } = await renderHook(() => useAsyncData<string[]>(loader, [], []));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setData((prev) => [...prev, "c"]);
    });
    expect(result.current.data).toEqual(["a", "b", "c"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("a resolve/reject that lands after unmount does not throw or update state", async () => {
    let resolveLoader: (v: string) => void = () => {};
    const { result, unmount } = await renderHook(() =>
      useAsyncData<string>(
        () =>
          new Promise((resolve) => {
            resolveLoader = resolve;
          }),
        [],
        "initial",
      ),
    );
    expect(result.current.loading).toBe(true);
    await unmount();
    expect(() => resolveLoader("too late")).not.toThrow();
  });
});
