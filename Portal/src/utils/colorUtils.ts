import * as fabric from 'fabric';

/**
 * @brief Fabric 색상 값(rgba 문자열/컬러 객체 등)을 "#RRGGBB" 형태의 hex 문자열로 정규화한다.
 * @details LayerList/색상 프리셋 스토어가 동일한 색상 판정 로직을 공유하기 위한 단일 소스.
 */
export const getColorHex = (color: any): string => {
    if (!color) return "#000000";
    if (typeof color === "string") {
        if (color === "transparent") return color;
        const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`.toUpperCase();
        }
        return color.toUpperCase();
    }
    try {
        return (color as any).toHex ? "#" + (color as any).toHex().toUpperCase() : "#000000";
    } catch {
        return "#000000";
    }
};

/**
 * @brief 스타일(fill/stroke)의 실체를 담고 있는 leaf 오브젝트까지 내려가 찾는다.
 * @details [Design Pattern: 없음, 단일 진실 공급원] MatrixRepeater는 `sourceObjects[0]`에,
 *          fabric.Group(예: 단일 DXF 임포트 결과)은 자식 엔티티에 실제 시각 정보가 있다.
 *          컨테이너 자신의 fill/stroke는 Fabric 기본값(검은 fill)일 뿐이라 이를 읽으면
 *          "DXF 매트릭스가 검은색 레이어로 분류되고 편집바에 Fill 체크로 표시"되는 오표시가
 *          생긴다(ScannerIssue3.md 이슈 3-①). 한 단계 위임(sourceObjects[0])만으로는 그것이
 *          다시 Group인 단일 DXF에서 부족하므로, 컨테이너가 아닌 leaf가 나올 때까지 내려간다.
 *          (guard 카운터로 순환/과도한 중첩을 방어)
 */
export const resolveStyleSourceObject = (obj: fabric.Object): fabric.Object => {
    let target: any = obj;
    let guard = 0;
    while (target && guard++ < 16) {
        if (target.type === 'MatrixRepeater' && target.sourceObjects?.[0]) {
            target = target.sourceObjects[0];
            continue;
        }
        const t = (target.type || '').toLowerCase();
        if ((t === 'group' || t === 'activeselection') && typeof target.getObjects === 'function' && target.getObjects().length > 0) {
            target = target.getObjects()[0];
            continue;
        }
        break;
    }
    return (target as fabric.Object) || obj;
};

/**
 * @brief 컨테이너(Group/ActiveSelection/MatrixRepeater)를 관통해 색상 실체(leaf) 오브젝트
 *        "전부"를 수집한다. (resolveStyleSourceObject가 "첫 leaf 1개"를 찾는 것의 전체판)
 * @details [Design Pattern: 단일 진실 공급원] 하강 규칙은 resolveStyleSourceObject와 반드시
 *          동일해야 한다(MatrixRepeater→sourceObjects, group/activeselection→children).
 *          규칙을 바꿀 때는 두 함수를 함께 수정할 것. 색상 적용(write) 경로
 *          (CanvasTopBar representativeColor, useCanvasStore 일괄 강제 재색상)가 이 함수를
 *          공유해 판정(read)-적용(write) 대칭을 보장한다. 사용자 그룹(Ctrl+G)·중첩 그룹·
 *          Dot 그룹·DXF 그룹·Dot 매트릭스가 모두 같은 규칙으로 처리된다.
 * @param obj 루트 오브젝트
 * @param depth 재귀 깊이(순환/과중첩 가드, 최대 16)
 */
export const collectStyleLeafObjects = (obj: fabric.Object, depth = 0): fabric.Object[] => {
    const target: any = obj;
    if (!target || depth > 16) return [];
    if (target.type === 'MatrixRepeater' && Array.isArray(target.sourceObjects)) {
        return target.sourceObjects.flatMap((s: any) => collectStyleLeafObjects(s, depth + 1));
    }
    const t = (target.type || '').toLowerCase();
    if ((t === 'group' || t === 'activeselection') && typeof target.getObjects === 'function') {
        return target.getObjects().flatMap((c: any) => collectStyleLeafObjects(c, depth + 1));
    }
    return [obj];
};

/**
 * @brief 기존 색상 값의 알파(불투명도)를 보존하면서 색상(hex)만 교체한다.
 * @details Fill 50% 같은 해칭 표시 설정이 재색상/강제 재색상 과정에서 유실되지 않도록 한다.
 *          알파가 1(불투명)이면 순수 hex를 반환해 rgba 문자열 오염을 피한다.
 */
export const replaceColorKeepAlpha = (oldColor: any, newHex: string): string => {
    try {
        const alpha = new fabric.Color(oldColor).getAlpha() ?? 1;
        if (alpha >= 1) return newHex;
        const c = new fabric.Color(newHex);
        c.setAlpha(alpha);
        return c.toRgba();
    } catch {
        return newHex;
    }
};

/**
 * @brief 도형의 대표 색상을 stroke 우선, 없으면 fill 기준으로 판정한다.
 *        LayerList의 "색상별 레이어 그룹핑" 기준과 동일해야 색상 프리셋이 정확히 매칭된다.
 * @details [Design Pattern: 없음] 컨테이너(MatrixRepeater/Group)는 resolveStyleSourceObject()로
 *          leaf까지 내려가 실제 셀/엔티티의 색을 읽는다. 이 보정이 없으면 색상별 그룹핑
 *          (useCanvasColorGroups, ScannerGenerator의 groupByColorPreset 등)이 매트릭스/DXF를
 *          엉뚱한 "#000000" 그룹으로 분류해버린다.
 */
export const resolveObjectColorHex = (obj: fabric.Object): string => {
    const target = resolveStyleSourceObject(obj);
    // [FIX 2026-07-22] getColorHex(null/undefined)는 기본값 "#000000"을 반환하므로,
    // stroke가 아예 없는 leaf(예: Dot의 원 — fill만 있고 stroke 미지정)를 변환 후에
    // 판정하면 fill 폴백이 영원히 실행되지 않아 검정 레이어로 오분류된다
    // (LayerList 그룹핑·Current Layer 스와치·ScannerGenerator/G-code 가공 그룹핑이
    // 모두 이 함수를 SSOT로 쓰므로 가공 파라미터까지 틀어지는 기능 버그).
    // 변환 전 raw 값으로 stroke 존재 여부를 먼저 검사한다.
    const rawStroke = (target as any).stroke;
    if (rawStroke && rawStroke !== 'transparent') {
        return getColorHex(rawStroke);
    }
    const rawFill = (target as any).fill;
    if (rawFill && rawFill !== 'transparent') {
        return getColorHex(rawFill);
    }
    // Fill/Line이 모두 해제된 도형은 customData에 보존된 원래 색으로 레이어 정체성을
    // 유지한다(CanvasTopBar의 표시 로직과 동일한 폴백 순서).
    const customData = (target as any).customData;
    if (customData?.originalStroke && customData.originalStroke !== 'transparent') {
        return getColorHex(customData.originalStroke);
    }
    if (customData?.originalFill && customData.originalFill !== 'transparent') {
        return getColorHex(customData.originalFill);
    }
    return 'transparent';
};
