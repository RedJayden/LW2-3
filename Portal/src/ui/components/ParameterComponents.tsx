import React, { ReactNode, useState } from 'react';

// --- Tooltip ---
export const Tooltip = React.memo(({ text, children, className = "" }: { text: string, children: ReactNode, className?: string }) => {
    const [visible, setVisible] = useState(false);

    return (
        <div 
            className={`relative inline-block ${className}`}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && (
                <div className="absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[280px] px-3 py-2 bg-slate-900 border border-cyan-500/30 text-cyan-50 text-[11px] leading-relaxed rounded shadow-[0_4px_20px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in duration-200">
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900" />
                    {text}
                </div>
            )}
        </div>
    );
});

// --- Card ---
export const ParameterCard = ({ children, className = '' }: { children: ReactNode, className?: string }) => (
    <div className={`bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700/50 ${className}`}>
        {children}
    </div>
);

// --- Header ---
export const ParameterSectionHeader = ({ title }: { title: string }) => {
    return (
        <div className="flex items-center mb-6 pb-2 border-b border-slate-700/50">
            <h3 className="text-lg font-bold tracking-widest uppercase text-cyan-400">
                {title}
            </h3>
        </div>
    );
};

// --- Input (with Unit) ---
interface ParameterInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    label: string;
    value: string | number;
    onChange: (value: any) => void;
    unit?: string;
    type?: 'text' | 'number';
    tooltip?: string;
}

export const ParameterInput = ({
    label,
    value,
    onChange,
    unit,
    type = 'text',
    className = '',
    tooltip,
    ...props
}: ParameterInputProps) => {
    const inputContent = (
        <div className={`group flex flex-col gap-1.5 ${className}`}>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 transition-colors group-focus-within:text-cyan-400">
                {label}
            </label>
            <div className={`relative flex items-center h-[42px] bg-slate-900 border border-slate-700 rounded overflow-hidden transition-all duration-200 hover:border-slate-500 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)] ${props.disabled ? 'opacity-50 hover:border-slate-700' : ''}`}>
                <input
                    type={type}
                    value={value}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(val);
                    }}
                    className="w-full h-full bg-transparent text-cyan-50 px-4 outline-none font-mono text-sm placeholder-slate-600 disabled:cursor-not-allowed"
                    {...props}
                />
                {unit && (
                    <div className="shrink-0 bg-slate-800 text-slate-500 text-xs font-mono px-3 border-l border-slate-700 h-full flex items-center select-none">
                        {unit}
                    </div>
                )}
            </div>
        </div>
    );

    if (tooltip) {
        return <Tooltip text={tooltip} className="w-full">{inputContent}</Tooltip>;
    }

    return inputContent;
};

// --- Slider (with Input) ---
interface ParameterSliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    className?: string;
}

export const ParameterSlider = ({
    label, value, onChange, min, max, step = 1, unit, className = ''
}: ParameterSliderProps) => {
    const [localVal, setLocalVal] = React.useState(value.toString());
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
        if (!focused) {
            setLocalVal(Math.floor(value).toString());
        }
    }, [value, focused]);

    const handleCommit = (valStr: string) => {
        let v = parseFloat(valStr);
        if (isNaN(v)) {
            v = value;
        } else {
            v = Math.min(Math.max(Math.floor(v), min), max);
        }
        setLocalVal(v.toString());
        onChange(v);
    };

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <div className="flex justify-between items-end px-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</label>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input
                            type="text"
                            value={localVal}
                            onFocus={() => {
                                setFocused(true);
                                setLocalVal(Math.floor(value).toString());
                            }}
                            onBlur={() => {
                                setFocused(false);
                                handleCommit(localVal);
                            }}
                            onChange={(e) => setLocalVal(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className="w-28 bg-cyan-950/30 text-cyan-400 text-xs font-mono px-2 py-1 rounded border border-cyan-500/20 outline-none focus:border-cyan-500/50 text-right"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-0">
                            {unit}
                        </span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-600 uppercase">{unit}</span>
                </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-900 p-2 rounded border border-slate-700 hover:border-slate-600 transition-colors">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Math.floor(parseFloat(e.target.value)))}
                    className="flex-1 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 mx-2"
                />
            </div>
        </div>
    );
};


// --- Select ---
interface ParameterSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { label: string, value: string }[];
    className?: string;
    tooltip?: string;
}

export const ParameterSelect = ({
    label,
    value,
    onChange,
    options,
    className = '',
    tooltip
}: ParameterSelectProps) => {
    const content = (
        <div className={`group flex flex-col gap-1.5 ${className}`}>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 transition-colors group-focus-within:text-cyan-400">
                {label}
            </label>
            <div className="relative flex items-center h-[42px] bg-slate-900 border border-slate-700 rounded overflow-hidden transition-all duration-200 hover:border-slate-500 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)]">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full h-full bg-transparent text-cyan-50 pl-4 pr-10 outline-none font-mono text-sm placeholder-slate-600 appearance-none cursor-pointer"
                >
                    {options.map(o => <option key={o.value} value={o.value} className="bg-slate-800 text-cyan-50">{o.label}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-cyan-400 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </div>
            </div>
        </div>
    );
    if (tooltip) {
        return <Tooltip text={tooltip} className="w-full">{content}</Tooltip>;
    }
    return content;
};


// --- Switch ---
export const ParameterSwitch = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (checked: boolean) => void }) => (
    <div
        className={`flex items-center justify-between bg-slate-900 px-4 py-3 rounded border transition-all cursor-pointer group 
        ${checked
                ? 'border-cyan-500/50 bg-cyan-950/10'
                : 'border-slate-700 hover:border-slate-600'
            }`}
        onClick={() => onChange(!checked)}
    >
        <span className={`text-sm font-bold transition-colors ${checked ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-400'}`}>{label}</span>
        <div className={`w-10 h-5 flex items-center rounded-full p-1 duration-300 ease-in-out ${checked ? 'bg-cyan-600 shadow-[0_0_10px_rgba(8,145,178,0.4)]' : 'bg-slate-700'}`}>
            <div className={`bg-white w-3 h-3 rounded-full shadow-sm transform duration-300 ease-in-out ${checked ? 'translate-x-5' : ''}`}></div>
        </div>
    </div>
);

// --- Layout ---
export const ParameterLayout = ({ title, children, actions }: { title: string | ReactNode, children: ReactNode, actions?: ReactNode }) => (
    <div className="h-full flex flex-col w-full max-w-[1920px] mx-auto p-4 md:p-6 lg:p-8 text-slate-200 font-sans bg-slate-900">
        {/* Header */}
        <header className="flex justify-between items-end mb-8 pb-4 border-b border-slate-700/50">
            <div>
                <nav className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-[0.2em]">
                    <span>Configuration</span>
                    <span className="text-slate-700">/</span>
                    <span className="text-cyan-500">Parameters</span>
                </nav>
                <div className="text-2xl font-black tracking-tight text-white flex items-center gap-4">
                    {title}
                </div>
            </div>
            <div className="flex gap-4">
                {actions}
            </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-20">
            {children}
        </main>
    </div>
);
