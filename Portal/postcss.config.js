/**
 * @file postcss.config.js
 * @brief PostCSS 설정 - Tailwind CSS v4
 *
 * Tailwind v4에서는 @tailwindcss/postcss 플러그인 사용 필수.
 * autoprefixer는 Tailwind v4에 내장되어 별도 설정 불필요.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
