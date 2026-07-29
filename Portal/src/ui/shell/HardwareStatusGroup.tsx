/**
 * @file HardwareStatusGroup.tsx
 * @brief 하드웨어 상태(Servo, Home, Alarm, EMO)를 타이틀바에 인라인 세그먼트 형태로 표시
 * @details
 *  - 디자인: [ 아이콘 + 라벨 | X Y Z ]
 *  - X/Y/Z는 개별 상태(현재는 Global Flag로 통합 제어)에 따라 Opacity/Color 변경
 *  - 반응형: 화면이 좁아지면 라벨 숨기기
 */

import { Box, Stack, Tooltip, useMediaQuery, Typography, Divider } from "@mui/material";
import { useTheme, type Theme, styled } from "@mui/material/styles";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded"; // Servo
import HomeRoundedIcon from "@mui/icons-material/HomeRounded"; // Home
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded"; // Alarm
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded"; // EMO (Emergency)
import BuildRoundedIcon from "@mui/icons-material/BuildRounded"; // Laser
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"; // Comm


import useAppStore, { selectors } from "../../store/appStore";

// ─────────────────────────────────────────────────────────────────────────────
// Styles & Components
// ─────────────────────────────────────────────────────────────────────────────

// 1. Labeled Container Style
const StatusContainer = styled(Box)(({ theme }: { theme: Theme }) => ({
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
}));

const createBadgeSx = (theme: Theme, color: "primary" | "error" | "warning" | "success" | "info" | "action") => {
    const isAction = color === "action";
    const mainColor = isAction ? theme.palette.text.primary : (theme.palette[color] as any).main;
    const bgColor = isAction ? "transparent" : mainColor + "1A";

    return {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        height: 28,
        borderRadius: "14px",
        bgcolor: bgColor, // 10% opacity
        color: isAction ? "inherit" : mainColor,
        px: 1.5,
        gap: 1,
        fontSize: "0.75rem",
        fontWeight: 600,
        userSelect: "none" as const,
        cursor: "help", // Indicate tooltip availability
        transition: "all 0.2s ease",
    };
};

// Segment (X Y Z) Style
const Segment = ({ label, on, color }: { label: string; on: boolean; color: string }) => (
    <Box
        component="span"
        sx={{
            opacity: on ? 1 : 0.3,
            color: on ? color : "inherit",
            fontWeight: on ? 800 : 500,
            transition: "opacity 0.2s",
        }}
    >
        {label}
    </Box>
);

// 2. Rich Tooltip Component
const RichTooltipContent = ({ title, items }: { title: string; items: { label: string; value: string; status: "ok" | "error" | "warn" | "neutral" }[] }) => {
    const theme = useTheme();
    return (
        <Box sx={{ p: 1, maxWidth: 220 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, pb: 0.5, borderBottom: `1px solid ${theme.palette.divider}`, fontWeight: 700 }}>
                {title}
            </Typography>
            <Stack spacing={0.5}>
                {items.map((item, idx) => (
                    <Stack key={idx} direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                        <Typography variant="caption" sx={{
                            fontWeight: 600,
                            color: item.status === "ok" ? "success.main" :
                                item.status === "error" ? "error.main" :
                                    item.status === "warn" ? "warning.main" : "text.primary"
                        }}>
                            {item.value}
                        </Typography>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function HardwareStatusGroup() {
    const theme = useTheme();
    // Hide labels on screens narrower than 1200px (Needs more space now)
    const showLabels = useMediaQuery("(min-width: 1200px)");

    // Store State
    const axisFlags = useAppStore((s: any) => s.motion.axisFlags);
    const ioFlags = useAppStore((s: any) => s.io?.flags ?? { emo: false, laser: false });
    const motionState = useAppStore((s: any) => s.motion?.state ?? "Unknown");
    const commError = useAppStore((s: any) => s.motion.commError ?? false);
    const commErrorMessage = useAppStore((s: any) => s.motion.commErrorMessage ?? "");
    const laserShutter = useAppStore((s: any) => s.laserShutter);

    // Derived States
    const isEmo = ioFlags.emo;

    // "X,Y,Z 축 중 하나라도 상태가 변경되면 적용되어 표시해야 한다." => Any True / All True based on the status type
    const servoFlags = axisFlags.servo;
    const homeFlags = {
        X: axisFlags.homed.X && axisFlags.servo.X,
        Y: axisFlags.homed.Y && axisFlags.servo.Y,
        Z: axisFlags.homed.Z && axisFlags.servo.Z,
    };
    const alarmFlags = axisFlags.alarm;
    const alarmReasonFlags = axisFlags.alarmReason || { X: "None", Y: "None", Z: "None" };

    const servoOn = servoFlags.X || servoFlags.Y || servoFlags.Z;
    const isHomed = homeFlags.X || homeFlags.Y || homeFlags.Z;
    const isAlarm = alarmFlags.X || alarmFlags.Y || alarmFlags.Z;

    // Derive Laser ON state from Process status
    const isRunning = (
        motionState.toLowerCase().includes("busy") ||
        motionState.toLowerCase().includes("run") ||
        motionState.toLowerCase().includes("running")
    ) && !motionState.toLowerCase().includes("paused");

    // [MOD] 최우선 순위 처리: 사용자가 셔터를 켜면 ON 표시, 그 외엔 가공 진행 시 ON
    const isLaserOn = laserShutter || isRunning;

    return (
        <StatusContainer>

            {/* Laser */}
            <Tooltip
                title={<RichTooltipContent
                    title="Laser Status"
                    items={[
                        { label: "Power", value: isLaserOn ? "ON" : "OFF", status: isLaserOn ? "error" : "neutral" },
                        { label: "Source", value: "Ready", status: "ok" }, // Mock
                        { label: "Shutter", value: "Closed", status: "neutral" } // Mock
                    ]}
                />}
                arrow placement="top"
            >
                <Box sx={{ width: 110, ...createBadgeSx(theme, isLaserOn ? "error" : "action") }}>
                    <BuildRoundedIcon sx={{ fontSize: 16 }} />
                    {showLabels && <span>LASER</span>}
                    <Segment label="ON" on={isLaserOn} color={(theme.palette.error as any).main} />
                </Box>
            </Tooltip>

            {/* Servo */}
            <Tooltip
                title={<RichTooltipContent
                    title="Motion Servo Status"
                    items={[
                        { label: "X-Axis", value: servoFlags.X ? "ON (Ready)" : "OFF", status: servoFlags.X ? "ok" : "neutral" },
                        { label: "Y-Axis", value: servoFlags.Y ? "ON (Ready)" : "OFF", status: servoFlags.Y ? "ok" : "neutral" },
                        { label: "Z-Axis", value: servoFlags.Z ? "ON (Ready)" : "OFF", status: servoFlags.Z ? "ok" : "neutral" },
                    ]}
                />}
                arrow placement="top"
            >
                <Box sx={{ width: 140, ...createBadgeSx(theme, servoOn ? "success" : "action") }}>
                    <BoltRoundedIcon sx={{ fontSize: 16 }} />
                    {showLabels && <span>SERVO</span>}
                    <Stack direction="row" spacing={0.5}>
                        <Segment label="X" on={servoFlags.X} color={(theme.palette.success as any).main} />
                        <Segment label="Y" on={servoFlags.Y} color={(theme.palette.success as any).main} />
                        <Segment label="Z" on={servoFlags.Z} color={(theme.palette.success as any).main} />
                    </Stack>
                </Box>
            </Tooltip>

            {/* Home */}
            <Tooltip
                title={<RichTooltipContent
                    title="Homing Status"
                    items={[
                        { label: "X-Axis", value: homeFlags.X ? "Homed" : "Required", status: homeFlags.X ? "ok" : "warn" },
                        { label: "Y-Axis", value: homeFlags.Y ? "Homed" : "Required", status: homeFlags.Y ? "ok" : "warn" },
                        { label: "Z-Axis", value: homeFlags.Z ? "Homed" : "Required", status: homeFlags.Z ? "ok" : "warn" },
                    ]}
                />}
                arrow placement="top"
            >
                <Box sx={{ width: 140, ...createBadgeSx(theme, isHomed ? "info" : "action") }}>
                    <HomeRoundedIcon sx={{ fontSize: 16 }} />
                    {showLabels && <span>HOME</span>}
                    <Stack direction="row" spacing={0.5}>
                        <Segment label="X" on={homeFlags.X} color={(theme.palette.info as any).main} />
                        <Segment label="Y" on={homeFlags.Y} color={(theme.palette.info as any).main} />
                        <Segment label="Z" on={homeFlags.Z} color={(theme.palette.info as any).main} />
                    </Stack>
                </Box>
            </Tooltip>

            {/* Alarm */}
            <Tooltip
                title={<RichTooltipContent
                    title="Active Alarms"
                    items={[
                        { label: "X-Axis", value: alarmFlags.X ? alarmReasonFlags.X : "None", status: alarmFlags.X ? "error" : "ok" },
                        { label: "Y-Axis", value: alarmFlags.Y ? alarmReasonFlags.Y : "None", status: alarmFlags.Y ? "error" : "ok" },
                        { label: "Z-Axis", value: alarmFlags.Z ? alarmReasonFlags.Z : "None", status: alarmFlags.Z ? "error" : "ok" },
                    ]}
                />}
                arrow placement="top"
            >
                <Box sx={{
                    width: 140,
                    ...createBadgeSx(theme, isAlarm ? "error" : "action"),
                    ...(isAlarm && { animation: "pulse 1s infinite" })
                }}>
                    <NotificationsActiveRoundedIcon sx={{ fontSize: 16 }} />
                    {showLabels && <span>ALARM</span>}
                    <Stack direction="row" spacing={0.5}>
                        <Segment label="X" on={alarmFlags.X} color={(theme.palette.error as any).main} />
                        <Segment label="Y" on={alarmFlags.Y} color={(theme.palette.error as any).main} />
                        <Segment label="Z" on={alarmFlags.Z} color={(theme.palette.error as any).main} />
                    </Stack>
                </Box>
            </Tooltip>
            {/* E-Stop */}
            <Tooltip title="Emergency Stop Button Status" arrow>
                <Box sx={{
                    width: 90,
                    ...createBadgeSx(theme, isEmo ? "error" : "action"),
                    ...(isEmo && { fontWeight: 800, bgcolor: (theme.palette.error as any).main, color: "#fff" })
                }}>
                    <PowerSettingsNewRoundedIcon sx={{ fontSize: 16 }} />
                    {showLabels && <span>E-Stop</span>}
                </Box>
            </Tooltip>

            {/* PMAC Comm Status */}
            <Tooltip title={commError ? `PMAC Error: ${commErrorMessage}` : "PMAC Link OK"} arrow>
                <Box sx={{
                    width: 90,
                    ...createBadgeSx(theme, commError ? "error" : "success"),
                    ...(commError && {
                        animation: "pulse 1.5s infinite",
                        "@keyframes pulse": {
                            "0%": { opacity: 1 },
                            "50%": { opacity: 0.4 },
                            "100%": { opacity: 1 },
                        }
                    })
                }}>
                    <LinkRoundedIcon sx={{ fontSize: 16 }} />
                    {showLabels && <span>COMM</span>}
                </Box>
            </Tooltip>

        </StatusContainer>
    );
}
