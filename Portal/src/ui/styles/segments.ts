/**
 * @file segments.ts
 * @brief Toolbar/Panel에서 재사용하는 세그먼트 토글/칩/아이콘 버튼 공통 스타일 유틸.
 * @details
 *  - 디자인 패턴: Presentation Utility (재사용 가능한 스타일 토큰)
 *  - 모든 색/라운드/호버/선택은 Material Theme를 기반으로 계산한다.
 */

import type { Theme } from "@mui/material/styles";

/** @brief theme.shape.borderRadius의 절반을 안전하게 반환한다. */
export function getSmallRadius(theme: Theme): number {
  const r = Number(theme.shape.borderRadius ?? 8);
  return Math.max(2, Math.round(r / 2));
}

/**
 * @brief Segmented ToggleButtonGroup 전용 SX 생성기
 * @param theme Material UI Theme
 * @param opts  높이, 아이콘 크기, 글자 크기 등 세부 옵션
 * @return SX object
 */
export function createSegmentGroupSx(
  theme: Theme,
  opts?: {
    height?: number;
    iconSize?: number;
    fontSize?: number;
    gap?: number; // px
  }
) {
  const height = opts?.height ?? 30;
  const iconSize = opts?.iconSize ?? 14;
  const fontSize = opts?.fontSize ?? 12;
  const gap = opts?.gap ?? 4; // 아이콘-텍스트 간격 

  return {
    height,
    "& .MuiToggleButton-root": {
      height,
      minHeight: height,
      paddingInline: theme.spacing(1),
      fontSize,
      fontWeight: 600,
      letterSpacing: "0.02em",
      borderRadius: getSmallRadius(theme),
      borderColor: theme.palette.divider,
      color: theme.palette.text.secondary,
      gap,
      "& .MuiSvgIcon-root": { fontSize: iconSize },
      "&.Mui-selected": {
        bgcolor: theme.palette.action.selected,
        borderColor: theme.palette.info.light,
        color: theme.palette.text.primary,
      },
      "&:hover": {
        borderColor: theme.palette.info.light,
        bgcolor: theme.palette.action.hover,
      },
    },
  } as const;
}

/**
 * @brief 상태 Chip 공통 스타일
 * @param theme Material UI Theme
 */
export function createStatusChipSx(theme: Theme, height = 30) {
  return {
    height,
    borderRadius: getSmallRadius(theme),
    fontSize: 12,
    fontWeight: 700,
  } as const;
}

/**
 * @brief 상단 바용 아이콘 버튼 크기 통일
 * @param size 정사각형 길이(px). 기본 30
 */
export function createSquareIconButtonSx(size = 30) {
  return { width: size, height: size } as const;
}
