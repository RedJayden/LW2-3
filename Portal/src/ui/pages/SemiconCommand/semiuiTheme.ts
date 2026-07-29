import { type MantineThemeOverride } from "@mantine/core";

/**
 * @brief 반도체 장비 UI를 위한 프리미엄 다크 테마 정의 (Mantine v8 호환)
 * @details 딥 다크 배경과 네온 포인트 컬러인 Cyan 계열을 사용합니다.
 */
export const semiuiTheme: MantineThemeOverride = {
  primaryColor: "cyan",
  primaryShade: 6,
  colors: {
    cyan: [
      "#e0fbff",
      "#bbf2ff",
      "#7ae4ff",
      "#33d4ff",
      "#00c2f2",
      "#00a1cc",
      "#007ea6",
      "#005d80",
      "#003e59",
      "#002133"
    ] as any,
  },
  fontFamily: "Inter, Roboto, sans-serif",
  headings: {
    fontFamily: "Outfit, sans-serif",
  },
  components: {
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
        withBorder: true,
      },
    },
  },
};
