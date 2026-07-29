import React, { useState } from "react";
import { 
  AppShell, 
  Box, 
  Burger, 
  Group, 
  Text, 
  ActionIcon, 
  Badge as MantineBadge,
  Stack,
  Tooltip,
  Paper,
  MantineProvider
} from "@mantine/core";
import { 
  LayoutDashboard, 
  Cpu, 
  Settings, 
  Bell, 
  Sun, 
  Moon, 
  Activity,
  History,
  AlertTriangle,
  Zap, 
  Thermometer, 
  Wind, 
  Layers 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import WaferMap from "./components/WaferMap";
import StatusCard from "./components/StatusCard";
import { semiuiTheme } from "./semiuiTheme";

/**
 * @brief 반도체 장비 통합 관제 페이지
 * @details 고도의 시각화와 실시간 피드백을 제공하는 대시보드입니다.
 *          Mantine v8 환경에 맞춰 레이아웃을 재구성하였습니다.
 */
const SemiconCommandPage: React.FC = () => {
  const [opened, setOpened] = useState(true);
  const [isDark, setIsDark] = useState(true);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: Cpu, label: "Equipment Control", active: false },
    { icon: Activity, label: "Real-time Monitor", active: false },
    { icon: History, label: "Process History", active: false },
    { icon: Settings, label: "Configuration", active: false },
  ];

  return (
    <MantineProvider theme={semiuiTheme}>
      <AppShell
        padding="xl"
        header={{ height: 70 }}
        navbar={{ 
          width: opened ? 260 : 80, 
          breakpoint: 'sm',
          collapsed: { mobile: !opened }
        }}
      >
        {/* Header */}
        <AppShell.Header 
          p="md" 
          className="bg-brand-dark/80 backdrop-blur-xl border-white/10"
          style={{ backgroundColor: 'rgba(10, 10, 15, 0.9)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}
        >
          <Group justify="space-between" h="100%">
            <Group>
              <Burger opened={opened} onClick={() => setOpened(!opened)} size="sm" color="gray" />
              <Box className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg">
                  <Cpu size={20} color="black" />
                </div>
                <Text size="xl" fw={800} className="tracking-tighter text-blue-400">
                  SEMICON<span className="text-white">COMMAND</span>
                </Text>
              </Box>
            </Group>

            <Group gap="sm">
              <MantineBadge variant="dot" color="green" size="lg" className="bg-green-500/10 border-green-500/20 px-4 py-3">
                SYSTEM ONLINE
              </MantineBadge>
              <ActionIcon variant="subtle" color="gray" size="lg">
                <Bell size={20} />
              </ActionIcon>
              <ActionIcon onClick={() => setIsDark(!isDark)} variant="subtle" color="gray" size="lg">
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </ActionIcon>
            </Group>
          </Group>
        </AppShell.Header>

        {/* Navbar */}
        <AppShell.Navbar 
          p="md" 
          className="bg-brand-dark/50 backdrop-blur-md border-white/5 transition-all duration-300"
          style={{ backgroundColor: 'rgba(10, 10, 15, 0.8)', borderRight: '1px solid rgba(255, 255, 255, 0.05)' }}
        >
            <Stack gap="xs">
              {navItems.map((item, index) => (
                <Tooltip key={index} label={item.label} position="right" disabled={opened} offset={20}>
                  <Box
                    onClick={() => {}}
                    className={`
                      flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all
                      ${item.active 
                        ? "bg-blue-500 text-black shadow-lg font-bold" 
                        : "text-gray-400 hover:bg-white/5 hover:text-white"}
                    `}
                  >
                    <item.icon size={22} />
                    {opened && <Text size="sm">{item.label}</Text>}
                  </Box>
                </Tooltip>
              ))}
            </Stack>
            
            <Box mt="auto">
              <div className="p-4 flex flex-col gap-2 rounded-lg border border-white/5 bg-white/5">
                <Group justify="space-between">
                  <Text size="xs" color="dimmed">Chamber Stability</Text>
                  <Text size="xs" color="green" fw={700}>98.2%</Text>
                </Group>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-blue-400 shadow-[0_0_8px_rgba(0,242,255,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: "98.2%" }}
                  />
                </div>
              </div>
            </Box>
        </AppShell.Navbar>
        <AppShell.Main>
          <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Stack gap="xl">
              <Group justify="space-between" align="flex-end">
                <Stack gap={4}>
                  <Text size="sm" color="dimmed" className="tracking-widest uppercase italic font-bold">System Monitoring</Text>
                  <Text size="xl" fw={900} color="white">Control Dashboard</Text>
                </Stack>
                <MantineBadge size="xl" color="orange" leftSection={<AlertTriangle size={14} />} className="px-4">
                  2 Pending Actions
                </MantineBadge>
              </Group>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatusCard 
                  title="Source Power" 
                  value="4,250" 
                  unit="W" 
                  icon={Zap} 
                  trend="up" 
                  color="blue"
                />
                <StatusCard 
                  title="Chamber Temp" 
                  value="24.8" 
                  unit="°C" 
                  icon={Thermometer} 
                  trend="stable" 
                  color="cyan"
                />
                <StatusCard 
                  title="Gas Flow (Ar)" 
                  value="340.5" 
                  unit="sccm" 
                  icon={Wind} 
                  trend="down"
                  color="orange"
                  warning 
                />
                <StatusCard 
                  title="Exposure Level" 
                  value="94.2" 
                  unit="%" 
                  icon={Layers} 
                  color="purple"
                />
              </div>

              {/* Visualization Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <WaferMap />
                </div>
                <div className="flex flex-col gap-6">
                  <Paper 
                    className="p-6 flex-1 border-l-4 border-l-orange-500"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderLeft: '4px solid #f97316' }}
                  >
                    <Group mb="md">
                      <AlertTriangle color="#ffab00" size={20} />
                      <Text fw={700} color="white">System Alerts</Text>
                    </Group>
                    <Stack gap="sm">
                      <div className="p-3 rounded bg-white/5 border border-white/5">
                        <Text size="xs" color="orange" fw={700}>WARNING: GAS_FLOW_LOW</Text>
                        <Text size="xs" color="dimmed">Chamber 01 argon flow rate deviation detected.</Text>
                      </div>
                      <div className="p-3 rounded bg-white/5 border border-white/5 opacity-50">
                        <Text size="xs" color="dimmed" fw={700}>INFO: RECIPIE_LOADED</Text>
                        <Text size="xs" color="dimmed">Batch SEM-2026-X12 configuration active.</Text>
                      </div>
                    </Stack>
                  </Paper>
                  
                  <Paper 
                    className="p-6 bg-blue-500/5"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(255, 255, 255, 0.05)' }}
                  >
                    <Text fw={700} mb="xs" color="white">Quick Actions</Text>
                    <Stack gap="xs">
                      <button className="w-full p-2 rounded-lg bg-blue-500 text-black font-bold hover:brightness-110 active:scale-95 transition-all text-xs">
                        EMERGENCY STOP
                      </button>
                      <button className="w-full p-2 rounded-lg border border-white/10 text-white font-bold hover:bg-white/5 active:scale-95 transition-all text-xs">
                        RESET ALARMS
                      </button>
                    </Stack>
                  </Paper>
                </div>
              </div>
            </Stack>
          </motion.div>
        </AnimatePresence>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
};

export default SemiconCommandPage;
