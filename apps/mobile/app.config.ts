import appJson from "./app.json";

const android = appJson.expo.android as Record<string, unknown> | undefined;
const ios = appJson.expo.ios as Record<string, unknown> | undefined;

export default {
  ...appJson,
  expo: {
    ...appJson.expo,
    android: {
      ...android,
      package: "com.gpstracker.mobile",
    },
    ios: {
      ...ios,
      bundleIdentifier: "com.gpstracker.mobile",
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
      eas: {
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
  },
};
