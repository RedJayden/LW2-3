/**
 * @file LogConsolePanel.tsx
 * @brief Slide-up terminal-style log output panel.
 * @details 고급(개발자) 모드에서만 열린다(useLogStore.advancedMode, TitleBar 로고 5회 클릭으로 토글).
 *          일반 사용자에게는 기본적으로 완전히 숨겨져 있다.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { Theme, useTheme } from "@mui/material";
import { Checkbox, FormControlLabel, IconButton, ToggleButton, ToggleButtonGroup } from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import BugReportIcon from '@mui/icons-material/BugReport';
import useLogStore, { LogLevel, LogEntry } from "@/store/logStore";

type FilterValue = LogLevel | 'all';

/** 화면 표시용으로 연속된 동일 로그(같은 level/source/message)를 하나로 묶은 그룹 */
interface GroupedLogEntry {
  first: LogEntry;
  last: LogEntry;
  count: number;
}

const LEVEL_META: Record<LogLevel, { color: string; bg: string; icon: typeof InfoIcon; label: string }> = {
  error: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: ErrorIcon, label: 'ERROR' },
  warn: { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', icon: WarningIcon, label: 'WARN' },
  info: { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', icon: InfoIcon, label: 'INFO' },
  debug: { color: '#9ca3af', bg: 'transparent', icon: BugReportIcon, label: 'DEBUG' },
};

export default function LogConsolePanel() {
  const theme = useTheme();
  const logs = useLogStore(s => s.logs);
  const isOpen = useLogStore(s => s.isLogPanelOpen);
  const advancedMode = useLogStore(s => s.advancedMode);
  const toggle = useLogStore(s => s.toggleLogPanel);
  const clearLogs = useLogStore(s => s.clearLogs);

  const [filter, setFilter] = useState<FilterValue>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 고급 모드가 꺼지면(개발자가 다시 로고를 5번 눌러 끄는 경우 등) 항상 닫혀 있어야 한다.
  const effectiveOpen = isOpen && advancedMode;

  // 필터링: 'all'은 편의상 Debug(고빈도 폴링 로그)는 제외한 "일반 로그 전체"를 의미한다.
  // 정말 Debug까지 보고 싶으면 Debug 탭을 따로 선택해야 한다 — 대부분의 로그 뷰어가
  // verbose/trace 레벨을 기본에서 빼는 것과 같은 이유(신호 대 잡음비).
  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs.filter(log => log.level !== 'debug');
    return logs.filter(log => log.level === filter);
  }, [logs, filter]);

  // 연속된 동일 로그(레벨/출처/메시지가 같은)를 그룹으로 묶어 "poll #12 ×38회"처럼 압축 표시.
  // 파일(Bin\Log)에는 이 압축과 무관하게 매 호출이 그대로 시간순으로 남는다(C++ LogManager 쪽).
  const groupedLogs = useMemo(() => {
    const groups: GroupedLogEntry[] = [];
    for (const log of filteredLogs) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.first.level === log.level && lastGroup.first.source === log.source && lastGroup.first.message === log.message) {
        lastGroup.last = log;
        lastGroup.count += 1;
      } else {
        groups.push({ first: log, last: log, count: 1 });
      }
    }
    return groups;
  }, [filteredLogs]);

  useEffect(() => {
    if (autoScroll && effectiveOpen && scrollRef.current) {
      const timer = setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [groupedLogs.length, autoScroll, effectiveOpen]);

  const handleScrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setAutoScroll(true);
    }
  };

  const handleFilterChange = (_: any, newFilter: FilterValue | null) => {
    if (newFilter !== null) setFilter(newFilter);
  };

  if (!advancedMode) return null;

  return (
    <div
      className={`fixed bottom-[28px] right-0 z-[9999] transition-all duration-300 ease-in-out border-t border-l shadow-2xl bg-[#121212] flex flex-col`}
      style={{
        width: 360, // Match RightPanel width
        height: effectiveOpen ? '400px' : '0px',
        maxHeight: effectiveOpen ? '600px' : '0px',
        borderColor: theme.palette.divider,
        opacity: effectiveOpen ? 1 : 0,
        pointerEvents: effectiveOpen ? 'auto' : 'none'
      }}
    >
      {/* Header Bar */}
      <div className="flex flex-col gap-1 px-2 py-1.5 border-b border-white/10 shrink-0 bg-[#1e1e1e]">
        <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-gray-300 pl-1 text-[13px] select-none">SYSTEM CONSOLE <span className="text-gray-500 font-normal">(고급 모드)</span></span>
            <div className="flex items-center">
                <FormControlLabel
                  control={<Checkbox size="small" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} sx={{ color: 'gray', p: 0.5 }} />}
                  label="Scroll"
                  sx={{ '.MuiFormControlLabel-label': { fontSize: 11, color: 'gray' }, m: 0, mr: 1 }}
                />
                <IconButton size="small" onClick={clearLogs} sx={{ color: 'gray', p: 0.5 }} title="Clear Logs">
                  <DeleteSweepIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => toggle(false)} sx={{ color: 'gray', p: 0.5 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
            </div>
        </div>
        <div className="flex items-center justify-center pb-0.5">
            <ToggleButtonGroup
              size="small"
              value={filter}
              exclusive
              onChange={handleFilterChange}
              sx={{
                height: 24,
                width: '100%',
                '.MuiToggleButton-root': {
                  flex: 1,
                  fontSize: '11px',
                  padding: '2px 4px',
                  color: 'gray',
                  borderColor: 'rgba(255,255,255,0.05)',
                  '&.Mui-selected': { color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }
                }
              }}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="info">Info</ToggleButton>
              <ToggleButton value="warn">Warn</ToggleButton>
              <ToggleButton value="error">Error</ToggleButton>
              <ToggleButton value="debug">Debug</ToggleButton>
            </ToggleButtonGroup>
        </div>
      </div>

      {/* Log List View */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 bg-[#0a0a0a] overflow-y-auto cursor-pointer"
        onClickCapture={handleScrollToBottom}
      >
        {groupedLogs.map((group) => {
          const meta = LEVEL_META[group.first.level];
          const LevelIcon = meta.icon;
          return (
            <div
              key={group.first.id}
              className="flex gap-1.5 px-2 py-1 font-mono text-[11.5px] hover:bg-white/5 border-b border-white/5"
              style={{ borderLeft: `3px solid ${meta.color}`, backgroundColor: meta.bg }}
            >
              <LevelIcon sx={{ fontSize: 14, color: meta.color, mt: '2px', flexShrink: 0 }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-gray-500 mb-0.5 gap-2">
                  <span className="truncate">[{group.first.timestamp}]</span>
                  <span className="font-bold shrink-0" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="text-purple-400 shrink-0">[{group.first.source}]</span>
                  <span className="text-gray-300 whitespace-pre-wrap break-words">{group.first.message}</span>
                </div>
                {group.count > 1 && (
                  <div className="text-gray-500 text-[10px] mt-0.5">
                    ×{group.count}회 반복 (마지막 {group.last.timestamp})
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
