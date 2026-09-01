import { scrollCardIntoView, scheduleScrollIntoView } from "../../lib/scrollIntoView";

// Override one export without touching the rest. Replacing the module
// wholesale breaks jest-expo's setup (it reads Platform.select as the preset
// loads), and spreading it eagerly evaluates React Native's lazy getters —
// a Proxy leaves both intact.
jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  return new Proxy(actual, {
    get: (target, prop) => (prop === "findNodeHandle" ? () => 99 : target[prop]),
  });
});

// A controllable frame queue: nothing runs until paintFrame() is called, so a
// callback that is cancelled or never scheduled is distinguishable from one
// that fires.
let frames: Array<() => void>;
const paintFrame = () => {
  const due = frames;
  frames = [];
  due.forEach((cb) => cb());
};

beforeEach(() => {
  frames = [];
  (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: () => void) => {
    frames.push(cb);
    return frames.length;
  };
});

type ScrollStub = Parameters<typeof scrollCardIntoView>[0];
type TargetStub = Parameters<typeof scrollCardIntoView>[1];

const makeRefs = (top = 500) => {
  const scrollTo = jest.fn();
  const scrollRef: ScrollStub = { current: { scrollTo } as unknown as ScrollStub["current"] };
  const targetRef: TargetStub = {
    current: {
      measureLayout: (_h: number, onSuccess: (l: number, t: number) => void) => onSuccess(0, top),
    } as unknown as TargetStub["current"],
  };
  return { scrollTo, scrollRef, targetRef };
};

describe("scrollCardIntoView", () => {
  it("scrolls to the target's offset less the gutter", () => {
    const { scrollTo, scrollRef, targetRef } = makeRefs(500);
    scrollCardIntoView(scrollRef, targetRef, 16);
    expect(scrollTo).toHaveBeenCalledWith({ y: 484, animated: true });
  });

  it("clamps to zero rather than scrolling to a negative offset", () => {
    const { scrollTo, scrollRef, targetRef } = makeRefs(4);
    scrollCardIntoView(scrollRef, targetRef, 16);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it("does nothing when the target has unmounted", () => {
    const { scrollTo, scrollRef } = makeRefs();
    scrollCardIntoView(scrollRef, { current: null }, 16);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does nothing when the scroll view has unmounted", () => {
    const { targetRef } = makeRefs();
    expect(() => scrollCardIntoView({ current: null }, targetRef, 16)).not.toThrow();
  });
});

describe("scheduleScrollIntoView", () => {
  // The regression this file exists for: the previous implementation routed
  // the target through React state and cancelled its own frame on the
  // re-render that clearing that state caused, so the scroll never ran.
  it("scrolls after two frames are painted", () => {
    const { scrollTo, scrollRef, targetRef } = makeRefs(500);
    scheduleScrollIntoView(scrollRef, targetRef, 16);

    expect(scrollTo).not.toHaveBeenCalled();
    paintFrame();
    expect(scrollTo).not.toHaveBeenCalled();
    paintFrame();
    expect(scrollTo).toHaveBeenCalledWith({ y: 484, animated: true });
  });

  it("survives the target unmounting between the tap and the frame", () => {
    const { scrollTo, scrollRef, targetRef } = makeRefs();
    scheduleScrollIntoView(scrollRef, targetRef, 16);
    paintFrame();
    targetRef.current = null;
    expect(() => paintFrame()).not.toThrow();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
