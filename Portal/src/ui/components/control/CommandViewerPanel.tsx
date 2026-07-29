/**
 * @file CommandViewerPanel.tsx
 * @brief Process 탭 전체를 덮는 커맨드/G-Code 전체 화면 뷰어 오버레이.
 * @details
 *  - 디자인 패턴: 공유 프레젠테이션 컴포넌트(Composition). Scanner(SinoGalvo/Scanlab)/Object
 *    세 Process 패널이 중복하던 하단 미리보기 UI를 하나로 일원화한다. 커맨드 텍스트 생성
 *    로직은 각 패널에 남기고, 이 컴포넌트는 문자열만 주입받아 표시만 담당(관심사 분리).
 *  - 부모 패널 루트(`position: relative`) 기준 `absolute inset-0`로 탭 창 전체를 덮는다.
 *    Close로 onClose를 호출하면 오버레이만 사라지고 원래 Process 화면이 복귀한다.
 *  - 주석 라인과 커맨드 라인을 색상으로 구분하고, 좌측 라인 넘버 거터를 표시한다.
 *    "Commands only" 체크박스로 넘버링 모드를 전환한다(해제: 주석 포함 전체 넘버링,
 *    체크: 주석 제외 커맨드만 넘버링).
 */

import React from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useAppStore } from '../../../store/appStore';

export interface CommandViewerPanelProps {
    /** 헤더 제목 (예: "Generated Commands", "Compiled RTC Commands", "G-Code") */
    title: string;
    /** 표시용 커맨드 개수 (옵션) */
    count?: number;
    /** 표시할 전체 커맨드 텍스트 */
    text: string;
    /** 닫기 콜백 (Close 버튼) */
    onClose: () => void;
}

/** 한 줄이 주석인지 판별 (Scanner: 블록 주석, G-Code: '//' 또는 ';' 시작) */
const isCommentLine = (line: string): boolean => {
    const t = line.trim();
    return t.startsWith('/*') || t.startsWith('//') || t.startsWith(';');
};

/**
 * @component CommandViewerPanel
 * @brief 커맨드 전체 텍스트를 라인 넘버 + 구문 색상과 함께 패널 전체 화면으로 표시.
 */
export const CommandViewerPanel: React.FC<CommandViewerPanelProps> = ({ title, count, text, onClose }) => {
    // [UX] 넘버링 모드: false = 주석 포함 전체 넘버링, true = 주석 제외 커맨드만 넘버링
    const [commandsOnly, setCommandsOnly] = React.useState(false);

    const handleCopy = () => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        useAppStore.getState().showToast('Commands copied', 'info');
    };

    // 라인 분해 + 각 라인의 주석 여부/표시 번호 계산
    const rows = React.useMemo(() => {
        const lines = text.split('\n');
        let counter = 0;
        return lines.map((line) => {
            const comment = isCommentLine(line);
            let number = '';
            if (commandsOnly && comment) {
                number = ''; // 주석 제외 모드: 주석은 번호 없음
            } else {
                counter += 1;
                number = String(counter);
            }
            return { line, comment, number };
        });
    }, [text, commandsOnly]);

    // 거터 폭: 최대 번호 자릿수 기준
    const gutterCh = React.useMemo(() => {
        const maxNum = rows.reduce((m, r) => (r.number ? Math.max(m, r.number.length) : m), 1);
        return Math.max(2, maxNum);
    }, [rows]);

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-slate-950 rounded-lg border border-slate-700 overflow-hidden">
            {/* 헤더 */}
            <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-900/80">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider truncate">
                        {title}
                    </span>
                    {count !== undefined && (
                        <span className="text-[10px] font-mono text-slate-500 flex-none">({count})</span>
                    )}
                </div>
                <button
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 px-2 py-1 rounded transition-colors flex-none"
                >
                    <ContentCopyIcon sx={{ fontSize: 13 }} />
                    Copy
                </button>
            </div>

            {/* 툴바: 넘버링 모드 체크박스 (라인 넘버 거터 상단) */}
            <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900/50">
                <label className="flex items-center gap-1.5 cursor-pointer select-none" title="체크: 주석 제외 커맨드만 번호매기기 / 해제: 주석 포함 전체 번호매기기">
                    <input
                        type="checkbox"
                        checked={commandsOnly}
                        onChange={(e) => setCommandsOnly(e.target.checked)}
                        className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-300">Commands only (주석 제외 번호)</span>
                </label>
            </div>

            {/* 본문: 라인 넘버 거터 + 구문 색상 */}
            <div
                className="flex-1 overflow-auto font-mono text-[11px] leading-5 bg-slate-950"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="min-w-max">
                    {rows.map((r, i) => (
                        <div key={i} className="flex whitespace-pre">
                            {/* 라인 넘버 거터 (가로 스크롤 시 좌측 고정) */}
                            <span
                                className="sticky left-0 z-10 flex-none text-right select-none text-slate-600 bg-slate-950 border-r border-slate-800 pr-2 pl-2"
                                style={{ minWidth: `calc(${gutterCh}ch + 1rem)` }}
                            >
                                {r.number}
                            </span>
                            {/* 코드 (주석 vs 커맨드 색 구분) */}
                            <span className={`px-3 ${r.comment ? 'text-amber-400/80 italic' : 'text-green-400'}`}>
                                {r.line || ' '}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 하단 닫기 버튼 */}
            <div className="flex-none flex justify-end px-3 py-2 border-t border-slate-700 bg-slate-900/80">
                <button
                    onClick={onClose}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold px-4 py-1.5 rounded transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
    );
};

CommandViewerPanel.displayName = 'CommandViewerPanel';
