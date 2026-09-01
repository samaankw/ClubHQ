/* global jest */
// react-native-safe-area-context's useSafeAreaInsets()/useSafeAreaFrame()
// throw when there's no <SafeAreaProvider> ancestor -- which every test that
// renders components/ui/Screen (now most screens) would otherwise need to
// wrap in one by hand. The package ships this exact mock for that reason;
// registering it here once means every test file gets working default
// insets without needing its own jest.mock(...) call.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);
