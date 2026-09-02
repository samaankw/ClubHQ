const { getDefaultConfig } = require("expo/metro-config");
// Compiled from an ES module, so the function itself is the `default` export,
// not the module object require() returns.
const exclusionList = require("metro-config/private/defaults/exclusionList").default;

const config = getDefaultConfig(__dirname);

// Test files are co-located with the screens they test under app/ (matching
// Jest's own co-located testMatch convention), but expo-router/_ctx.js scans
// the ENTIRE app/ directory with a require.context that only excludes
// +api/+html routes -- not test files. Metro's require.context eagerly
// evaluates every matched file to build the route table, which runs each
// test file's top-level jest.mock()/describe()/test() calls in the real app
// runtime, where `expect`/`jest` don't exist ("Can't find variable: expect").
// Block them from Metro's resolver entirely so expo-router's route scan
// never sees them. Jest resolves test files through its own testMatch/
// jest-resolve pipeline, never Metro's, so this has no effect on the actual
// test suite.
config.resolver.blockList = exclusionList([/\.(test|spec)\.[jt]sx?$/]);

module.exports = config;
