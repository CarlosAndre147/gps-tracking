/** Paleta alinhada à web — [apps/web/tailwind.config.js](apps/web/tailwind.config.js) */
export const theme = {
  brand: {
    primary: "#CC8C1C",
    primaryDark: "#B2721C",
    secondary: "#352D57",
    accent: "#6980A4",
  },
  layout: {
    sidebarBg: "#201A1B",
    sidebarText: "#B8BACC",
    sidebarActive: "#CC8C1C",
    headerBg: "#FFFFFF",
    bodyBg: "#F0EFF0",
    cardBg: "#FFFFFF",
    border: "#D8C1BD",
  },
  text: {
    main: "#201A1B",
    secondary: "#7C645F",
    inverted: "#F0EFF0",
    muted: "#B8BACC",
  },
  status: {
    success: "#679AA4",
    warning: "#CC9D44",
    error: "#B4845C",
    info: "#8DB7BB",
  },
  charts: ["#352D57", "#CC8C1C", "#6980A4", "#8DB7BB", "#B2721C", "#7C645F"] as const,
} as const;

/** Compat com template Expo (components legados). */
export const Colors = {
  light: {
    text: theme.text.main,
    background: theme.layout.bodyBg,
    tint: theme.brand.primary,
    icon: theme.text.secondary,
    tabIconDefault: theme.text.muted,
    tabIconSelected: theme.brand.primary,
  },
  dark: {
    text: theme.text.inverted,
    background: theme.layout.sidebarBg,
    tint: theme.brand.primary,
    icon: theme.text.muted,
    tabIconDefault: theme.text.muted,
    tabIconSelected: theme.brand.primary,
  },
} as const;
