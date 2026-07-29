import React from "react";
import type { LucideIcon } from "lucide-react";
import { Paper, Text, Group, Box, Badge as MantineBadge } from "@mantine/core";
import { motion } from "framer-motion";

/**
 * @brief 실시간 상태 카드 컴포넌트
 * @details 장비의 개별 파라미터(온도, 압력 등)를 시각화하며, 
 *          임계치 초과 시 경고 애니메이션을 제공합니다.
 * @note Mantine v8 호환성을 위해 Badgeprops 등을 조정함.
 */
interface StatusCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "stable";
  color?: string;
  warning?: boolean;
}

const StatusCard: React.FC<StatusCardProps> = ({ 
  title, value, unit, icon: Icon, trend, color = "blue", warning 
}) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Paper 
        className={`glass-card p-5 relative overflow-hidden ${warning ? "border-red-500/50 shadow-red-500/20" : "border-white/10"}`}
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(10px)' }}
      >
        {/* Warning Pulse Background */}
        {warning && (
          <motion.div 
            className="absolute inset-0 bg-red-500/5"
            animate={{ opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        <Group justify="space-between" mb="sm">
          <Box className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-500`}>
            <Icon size={18} />
          </Box>
          {trend && (
            <MantineBadge size="xs" color={trend === "up" ? "green" : trend === "down" ? "red" : "gray"}>
              {trend.toUpperCase()}
            </MantineBadge>
          )}
        </Group>

        <Text size="xs" color="dimmed" fw={700} className="uppercase tracking-widest mb-1 italic">
          {title}
        </Text>
        
        <Group align="flex-end" gap={4}>
          <Text size="xl" fw={900} className={warning ? "text-red-500" : "text-white"}>
            {value}
          </Text>
          {unit && <Text size="sm" color="dimmed" pb={4}>{unit}</Text>}
        </Group>

        {/* Decorative Grid Line */}
        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
      </Paper>
    </motion.div>
  );
};

export default StatusCard;
