// Pinned so date-dependent tests are deterministic wherever they run.
// The weeklyOccurrences DST test asserts that a 5 PM practice stays at 5 PM
// across the spring-forward — in UTC or Europe/London that assertion also
// holds for the fixed-millisecond arithmetic it replaced, so it only guards
// the behaviour in a zone that actually observes a transition on that date.
process.env.TZ = "America/New_York";

module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))",
  ],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  // Agent git worktrees live at .claude/worktrees/<name>/ inside the repo, so
  // each one carries a full copy of __tests__. Without this, `npm test` in the
  // main checkout also runs every worktree's suite — reporting other branches'
  // in-progress failures as if they were this branch's.
  testPathIgnorePatterns: ["/node_modules/", "/\\.claude/"],
  transform: { "\\.mjs$": "babel-jest" },
};
