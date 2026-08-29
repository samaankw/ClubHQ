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
