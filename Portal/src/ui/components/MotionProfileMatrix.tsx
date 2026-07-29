import React from 'react';
import { ParameterCard, ParameterSectionHeader } from './ParameterComponents';

export interface MatrixColumn {
    key: string;
    label: string;
    colorClass: string; // e.g., "text-cyan-400"
    bgClass?: string;   // e.g., "bg-cyan-950/10"
    borderClass?: string; // e.g., "border-cyan-500/20"
}

export interface MatrixRow {
    key: string;
    label: string;
    unit: string;
}

interface MotionProfileMatrixProps {
    title?: string;
    data: any;
    columns: MatrixColumn[];
    rows: MatrixRow[];
    onUpdate: (columnKey: string, rowKey: string, value: number) => void;
}

export const MotionProfileMatrix: React.FC<MotionProfileMatrixProps> = ({
    title = "Motion Profiles",
    data,
    columns,
    rows,
    onUpdate
}) => {

    const renderCell = (colKey: string, rowKey: string, unit: string) => (
        <div className="group flex items-center bg-slate-900 border border-slate-700 rounded overflow-hidden transition-all focus-within:border-cyan-500/50 focus-within:shadow-[0_0_10px_-3px_rgba(6,182,212,0.2)]">
            <input
                type="number"
                value={data[colKey]?.[rowKey] ?? 0}
                onChange={(e) => onUpdate(colKey, rowKey, parseFloat(e.target.value))}
                className="w-full bg-transparent text-cyan-50 font-mono text-sm px-3 py-2 outline-none"
                placeholder="0"
            />
            <div className="shrink-0 bg-slate-800 text-slate-500 text-[10px] font-bold px-2 border-l border-slate-700 h-full flex items-center min-bg-[30px] select-none">
                {unit}
            </div>
        </div>
    );

    return (
        <ParameterCard className="h-full">
            <ParameterSectionHeader title={title} />

            <div className="overflow-hidden rounded-lg border border-slate-700/50">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800 border-b border-slate-700">
                            <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-1/4">Parameter</th>
                            {columns.map(col => (
                                <th key={col.key} className={`p-3 text-[10px] font-bold uppercase tracking-widest text-right w-1/4 border-l border-slate-700/30 ${col.colorClass} ${col.bgClass || ''}`}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                        {rows.map((row, idx) => (
                            <tr key={row.key} className={`transition-colors ${idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/80'} hover:bg-slate-800/30`}>
                                <td className="p-3 py-2 text-[10px] font-bold text-slate-300 uppercase">{row.label}</td>
                                {columns.map(col => (
                                    <td key={`${col.key}-${row.key}`} className={`p-1.5 border-l border-slate-700/30 ${col.bgClass ? 'bg-opacity-5' : ''} ${col.bgClass?.replace('/10', '/5') || ''}`}>
                                        {renderCell(col.key, row.key, row.unit)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </ParameterCard>
    );
};
