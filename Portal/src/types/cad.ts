/**
 * @file cad.ts
 * @brief Interfaces for CAD objects and G-Code generation settings.
 */

import * as fabric from 'fabric';

/**
 * @interface ICadObject
 * @brief Represents a CAD object compatible with G-Code generation.
 * @extends fabric.Object
 */
export interface ICadObject extends fabric.Object {
    id?: string;
    // Add specific custom properties if needed
}

/**
 * @interface IGCodeSettings
 * @brief Configuration settings for G-Code generation.
 */
export interface IGCodeSettings {
    /**
     * @brief Feed rate for cutting moves (G1/G2/G3).
     * @unit mm/min
     */
    feedRate: number;

    /**
     * @brief Intensity of the laser/spindle (S-value).
     * @range 0-1000 (typically)
     */
    intensity: number;

    /**
     * @brief Number of passes for the cut.
     */
    passes: number;

    /**
     * @brief Z-height for rapid moves (G0).
     * @unit mm
     */
    safeZ: number;

    /**
     * @brief Z-height for cutting moves.
     * @unit mm
     */
    workingZ: number;

    /**
     * @brief Whether to include comments in the G-Code.
     */
    includeComments: boolean;

    /**
     * @brief Whether to include Safe Z moves in the G-Code.
     */
    includeSafeZ: boolean;

    /**
     * @brief Delay time between shapes/objects (in seconds).
     */
    shapeDelay: number;

    /**
     * @brief Number of times to repeat the entire marking sequence (Mark times).
     * @range 1-9999, default 1
     */
    markTimes?: number;

    /**
     * @brief Binarization/Edge sensitivity threshold (0-100).
     */
    threshold?: number;
}

/**
 * @interface IColorPreset
 * @brief 색상(레이어) 단위로 묶인 가공 파라미터 프리셋. Mark Times는 도형 단위가 아니라
 *        같은 색상으로 묶인 그룹 단위로 적용된다 (ScannerGenerator/useGCodeGenerator 참조).
 */
export interface IColorPreset {
    /** 프리셋을 식별하는 색상 hex (예: "#FF0000"). 레시피 내장 프리셋의 키로 사용. */
    color: string;
    /** 전역 프리셋 라이브러리에 저장할 때만 사용하는 사용자 지정 이름. */
    name?: string;
    /** 이 색상 그룹의 반복 가공 횟수. */
    markTimes: number;
    /** 가공 속도 (mm/s). */
    markSpeed: number;
    /** 레이저 출력 (AMP, %). */
    power: number;
    /**
     * 이 색상이 가공될 절대 Z(mm) — 기준 Z에 더하는 상대 오프셋이 아니다.
     * 매트릭스의 셀별 Z-step/오버라이드는 이 값 위에 추가로 누적된다(원뿔형 가공 등 3D 마킹).
     * 처음 생성될 때는 useCanvasStore.getColorPresetOrDefault가 현재 모션 Z축 위치를 기본값으로 채운다. */
    zOffset: number;
}

/**
 * @interface IFillSettings
 * @brief Configuration settings for object filling (hatching) and outline.
 */
export interface IFillSettings {
    // --- Profile (외곽선) 설정 ---
    enableProfile: boolean;       // 외곽선 출력 여부
    profileStartPoint: 'LT' | 'LB' | 'RT' | 'RB'; // 외곽선 시작 위치
    profileDirection: 'CW' | 'CCW'; // 외곽선 진행 방향 (시계/반시계)

    // --- Fill (내부 채우기) 설정 ---
    enableFill: boolean;          // 채우기 출력 여부
    fillType: 'OneWay' | 'TwoWay' | 'OptimizedTwoWay' | 'OptimizedBow'; // 채우기 타입
    fillProgression: 'L2R' | 'R2L' | 'T2B' | 'B2T'; // 채우기 진행/스캔 방향 (좌->우, 우->좌, 상->하, 하->상)
    angle: number;                // 채우기 선 각도
    lineSpacing: number;          // 선 간격 (mm)
    margin: number;               // 외곽 마진 (mm)
}
