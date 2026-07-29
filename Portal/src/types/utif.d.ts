/**
 * @file utif.d.ts
 * @brief UTIF.js (TIFF 디코더) 최소 타입 선언.
 *        패키지에 공식 타입 정의가 없어 프로젝트에서 사용하는 API만 선언한다.
 */
declare module 'utif' {
    /** @brief TIFF IFD(Image File Directory) — 디코딩된 페이지 메타데이터 */
    export interface UtifIFD {
        width: number;
        height: number;
        [tag: string]: unknown;
    }

    /** @brief TIFF 바이너리에서 IFD 목록을 파싱한다. */
    export function decode(buffer: ArrayBuffer | Uint8Array): UtifIFD[];

    /** @brief 지정 IFD의 픽셀 데이터를 디코딩한다. (decode 후 호출) */
    export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: UtifIFD, ifds?: UtifIFD[]): void;

    /** @brief 디코딩된 IFD를 RGBA8 배열로 변환한다. */
    export function toRGBA8(ifd: UtifIFD): Uint8Array;
}
