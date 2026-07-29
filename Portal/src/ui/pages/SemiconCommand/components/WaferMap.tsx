import React from "react";
import { Box, Text, Group, Paper, Stack } from "@mantine/core";
import { motion } from "framer-motion";

/**
 * @brief 웨이퍼 맵 시각화 컴포넌트
 * @details 반도체 웨이퍼의 다이(Die) 상태를 그리드 형태로 표시하며, 
 *          개별 다이의 공정 결과(Pass/Fail/Processing)를 색상으로 구분합니다.
 * @note Mantine v8 호환성 유지.
 */
interface Die {
  id: string;
  x: number;
  y: number;
  status: "PASS" | "FAIL" | "PROCESSING" | "PENDING";
}

const WaferMap: React.FC = () => {
  // Mock data for a circular wafer layout
  const dies: Die[] = [];
  const radius = 5;
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      if (Math.sqrt(x * x + y * y) <= radius) {
        const rand = Math.random();
        dies.push({
          id: `${x}_${y}`,
          x,
          y,
          status: rand > 0.9 ? "FAIL" : rand > 0.7 ? "PROCESSING" : rand > 0.4 ? "PASS" : "PENDING"
        });
      }
    }
  }

  const getDieColor = (status: Die["status"]) => {
    switch (status) {
      case "PASS": return "#00e676";
      case "FAIL": return "#ff3d00";
      case "PROCESSING": return "#00f2ff";
      default: return "rgba(255, 255, 255, 0.1)";
    }
  };

  return (
    <Paper 
      className="glass-card p-6 h-full flex flex-col transition-all hover:border-blue-500/30 border-white/10"
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(10px)' }}
    >
      <Group justify="space-between" mb="md">
        <Stack gap={0}>
          <Text fw={700} color="white">Wafer Visualizer</Text>
          <Text size="xs" color="dimmed">Lot: #SEM-2026-X12</Text>
        </Stack>
        <Group gap="xs">
          {["PASS", "FAIL", "PROCESSING"].map((s) => (
            <Group gap={4} key={s}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getDieColor(s as any) }} />
              <Text size="xs" color="dimmed">{s}</Text>
            </Group>
          ))}
        </Group>
      </Group>

      <Box className="flex-1 flex items-center justify-center relative overflow-hidden min-h-[350px]">
        {/* Wafer Outer Circle */}
        <div className="absolute w-[320px] h-[320px] border-2 border-white/10 rounded-full bg-white/[0.02] shadow-inner" />
        
        {/* Die Grid */}
        <div 
          className="grid gap-1 relative z-10"
          style={{ 
            gridTemplateColumns: `repeat(${radius * 2 + 1}, minmax(0, 1fr))`,
            width: "280px",
            display: 'grid'
          }}
        >
          {dies.map((die) => (
            <motion.div
              key={die.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: Math.random() * 0.5 }}
              whileHover={{ scale: 1.2, zIndex: 20 }}
              className="aspect-square rounded-sm cursor-pointer shadow-sm"
              style={{ 
                backgroundColor: getDieColor(die.status),
                boxShadow: die.status === "PROCESSING" ? "0 0 10px #00f2ff" : "none"
              }}
            />
          ))}
        </div>
      </Box>
    </Paper>
  );
};

export default WaferMap;
