module.exports =
  /** @type {import("@jest/types").Config.InitialOptions} */
  ({
    testMatch: ["**/*.test.ts"],
    transform: {
      "^.+\\.(js|jsx)$": "babel-jest",
      "^.+\\.(ts)$": "ts-jest",
    },
    transformIgnorePatterns: ['/node_modules/(?!(ansi-regex)/)'],
  });
