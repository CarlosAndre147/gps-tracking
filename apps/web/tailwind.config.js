/** @type {import('tailwindcss').Config} */
/** Paleta alinhada à identidade corporativa tipo [Vérttice GR](https://www.vertticegr.com.br/) — âmbar/dourado, roxo profundo, neutros quentes. */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
      colors: {
        brand: {
          primary: "#CC8C1C",
          "primary-dark": "#B2721C",
          secondary: "#352D57",
          accent: "#6980A4",
        },
        layout: {
          "sidebar-bg": "#201A1B",
          "sidebar-text": "#B8BACC",
          "sidebar-active": "#CC8C1C",
          header: "#FFFFFF",
          body: "#F0EFF0",
          card: "#FFFFFF",
          border: "#D8C1BD",
        },
        text: {
          main: "#201A1B",
          secondary: "#7C645F",
          inverted: "#F0EFF0",
          muted: "#B8BACC",
        },
        feedback: {
          success: "#679AA4",
          warning: "#CC9D44",
          error: "#B4845C",
          info: "#8DB7BB",
        },
        chart: {
          1: "#352D57",
          2: "#CC8C1C",
          3: "#6980A4",
          4: "#8DB7BB",
          5: "#B2721C",
          6: "#7C645F",
        },
        accent: {
          active: "#679AA4",
          inactive: "#B4845C",
        },
      },
    },
  },
  plugins: [],
};
