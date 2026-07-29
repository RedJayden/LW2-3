import { Box, Typography } from "@mui/material";
import { keyframes } from "@mui/system";
import useAppStore from "../../../store/appStore";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
`;

export default function GlobalToast() {
    const { message, type } = useAppStore((s) => s.notification);

    if (!message) return null;

    // Colors based on type
    const bgColors = {
        success: "#4caf50", // Green
        info: "#2196f3", // Blue
        warning: "#ff9800", // Orange
        error: "#f44336", // Red
    };

    const bgColor = bgColors[type] || bgColors.info;

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                px: 2,
                py: 0.5,
                borderRadius: 1,
                bgcolor: bgColor,
                color: "#fff",
                boxShadow: 2,
                animation: `${fadeIn} 0.3s ease-out`,
                maxWidth: 400,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
            }}
        >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {message}
            </Typography>
        </Box>
    );
}
