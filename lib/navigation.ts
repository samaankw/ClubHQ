import { router } from "expo-router";

// router.back() throws "'GO_BACK' was not handled by any navigator" when a
// modal is the first screen in the stack — e.g. a browser refresh lands
// directly on the modal's URL, so there's no history entry to pop. Fall back
// to replacing with a known route instead of leaving the user stuck.
export function goBackOr(fallback: string) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}
