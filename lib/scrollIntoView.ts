import { findNodeHandle } from "react-native";
import type { ScrollView, View } from "react-native";

type Ref<T> = { current: T | null };

/**
 * Scroll `targetRef` to the top of `scrollRef`, leaving `gutter` above it.
 *
 * Measures through the shadow layout tree, so the offset is content-relative
 * and unaffected by where the user has already scrolled to. Every handle is
 * null-checked because the target card may be conditionally rendered and can
 * unmount between the tap and the frame this runs on.
 */
export function scrollCardIntoView(scrollRef: Ref<ScrollView>, targetRef: Ref<View>, gutter: number): void {
  const scrollNode = scrollRef.current;
  const target = targetRef.current;
  const scrollHandle = scrollNode && findNodeHandle(scrollNode);
  if (!scrollNode || !target || !scrollHandle) return;
  target.measureLayout(
    scrollHandle,
    (_left, top) => scrollNode.scrollTo({ y: Math.max(top - gutter, 0), animated: true }),
    () => {},
  );
}

/**
 * Same, deferred by two animation frames.
 *
 * The caller taps a control that both selects a team and reveals the card to
 * scroll to, so the card may only just be mounting; measuring on the same tick
 * races its native layout and lands on a stale offset. Two frames is the
 * smallest reliable wait.
 *
 * Deliberately takes no React state. An earlier version round-tripped the
 * target through `useState` and cleared it at the top of the effect that
 * scheduled the frame — which re-rendered, tore the effect down, and ran
 * `cancelAnimationFrame` in the same JS task, strictly before the frame could
 * fire. The scroll never happened, and nothing in the type checker, the
 * linter, or the test suite noticed.
 */
export function scheduleScrollIntoView(scrollRef: Ref<ScrollView>, targetRef: Ref<View>, gutter: number): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => scrollCardIntoView(scrollRef, targetRef, gutter));
  });
}
