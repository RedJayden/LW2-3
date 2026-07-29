export const PX_PER_MM = 1000;
export const PX_SCALING_FACTOR = PX_PER_MM / 3.7795;
export const PAPER_WIDTH = 460 * PX_PER_MM;
export const PAPER_HEIGHT = 460 * PX_PER_MM;

/**
 * @brief Navigate Mode(더블클릭 이동) 전용 고가시성 크로스헤어 커서
 * @details 흰색 가공면/검은색 미가공면/다색 도형 어디서든 보이도록
 *          검정 아웃라인 + 흰색 심 이중 구조의 SVG 커서를 사용한다. (핫스팟: 중앙 12,12)
 */
const NAVIGATE_CURSOR_SVG =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g stroke='black' stroke-width='4' stroke-linecap='round'>` +
    `<line x1='12' y1='1' x2='12' y2='8'/><line x1='12' y1='16' x2='12' y2='23'/>` +
    `<line x1='1' y1='12' x2='8' y2='12'/><line x1='16' y1='12' x2='23' y2='12'/>` +
    `</g>` +
    `<g stroke='white' stroke-width='2' stroke-linecap='round'>` +
    `<line x1='12' y1='1' x2='12' y2='8'/><line x1='12' y1='16' x2='12' y2='23'/>` +
    `<line x1='1' y1='12' x2='8' y2='12'/><line x1='16' y1='12' x2='23' y2='12'/>` +
    `</g>` +
    `<circle cx='12' cy='12' r='2.5' fill='white' stroke='black' stroke-width='1.5'/>` +
    `</svg>`;

export const NAVIGATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(NAVIGATE_CURSOR_SVG)}") 12 12, crosshair`;
