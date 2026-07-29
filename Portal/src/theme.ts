
import { createTheme } from "@mui/material/styles";
import { blue, pink } from "@mui/material/colors";

// Dark Theme
export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: blue[300],
    },
    secondary: {
      main: pink[300],
    },
    background: {
      default: "#0B1121",
      paper: "#151B25",
    },
  },
  typography: {
    fontFamily: "Inter, var(--font-ui)",
    fontSize: 14,
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 8 } } },
  },
});

// Light Theme
export const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: blue,
    secondary: pink,
    background: {
      default: "#f5f5f5",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "Inter, var(--font-ui)",
    fontSize: 14,
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 8 } } },
  },
});

export const themes = {
  dark: darkTheme,
  light: lightTheme,
};
