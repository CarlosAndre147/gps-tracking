const defaults = {

  VITE_API_URL: "http://localhost:3000",

  VITE_WS_URL: "ws://localhost:3000",

} as const;



export type WebEnv = {

  VITE_API_URL: string;

  VITE_WS_URL: string;

};



export function getEnv(): WebEnv {

  return {

    VITE_API_URL: import.meta.env.VITE_API_URL ?? defaults.VITE_API_URL,

    VITE_WS_URL: import.meta.env.VITE_WS_URL ?? defaults.VITE_WS_URL,

  };

}



export function apiBaseUrl(): string {

  return getEnv().VITE_API_URL.replace(/\/$/, "");

}



export function wsBaseUrl(): string {

  return getEnv().VITE_WS_URL.replace(/\/$/, "");

}

