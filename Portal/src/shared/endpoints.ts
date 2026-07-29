// shared/endpoints.ts
declare const __APP_HOST__: string | undefined;

const getAppHost = () => {
  try {
    return typeof __APP_HOST__ !== 'undefined' ? __APP_HOST__ : "http://app";
  } catch {
    return "http://app";
  }
};

export const APP_HOST = getAppHost();

export const camFrameUrl = (id: number) =>
  `${APP_HOST}/camera/frame?id=${id}`;

export const camFps = (id: number) =>
  `${APP_HOST}/camera/fps?id=${id}`;