// Pinned so date-dependent tests are deterministic wherever they run.
// The weeklyOccurrences DST test asserts that a 5 PM practice stays at 5 PM
// across the spring-forward — in UTC or Europe/London that assertion also
// holds for the fixed-millisecond arithmetic it replaced, so it only guards
// the behaviour in a zone that actually observes a transition on that date.
process.env.TZ = "America/New_York";

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))",
  ],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testPathIgnorePatterns: ["/node_modules/", "/supabase/functions/", "/\\.claude/"],
  transform: { "\\.mjs$": "babel-jest" },
  setupFiles: ["<rootDir>/jest.setup.js"],
};
