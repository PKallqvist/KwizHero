import { createTheme } from "@mantine/core";

export const kwizTheme = createTheme({
  primaryColor: "teal",
  defaultRadius: "md",
  fontFamily: "Aptos, Segoe UI, Candara, Trebuchet MS, sans-serif",
  radius: {
    sm: "10px",
    md: "12px",
    lg: "16px",
  },
  headings: {
    fontFamily: "Aptos Display, Aptos, Segoe UI, sans-serif",
  },
  colors: {
    teal: [
      "#e8f8f5",
      "#caeee7",
      "#9fddd2",
      "#71cabd",
      "#4ab9aa",
      "#2cae9f",
      "#15948a",
      "#0f6b5f",
      "#0c554d",
      "#083f3a",
    ],
  },
  components: {
    Card: {
      defaultProps: {
        radius: "md",
      },
    },
    Paper: {
      defaultProps: {
        radius: "md",
      },
    },
  },
});
