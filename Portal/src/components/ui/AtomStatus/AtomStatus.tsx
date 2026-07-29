import React from 'react';
import styles from './AtomStatus.module.css';
import clsx from 'clsx';

interface AtomStatusProps {
    label: string;
    active?: boolean;
    status?: 'ready' | 'busy' | 'error' | 'unknown' | string;
}

export const AtomStatus: React.FC<AtomStatusProps> = ({ label, active = false, status = 'unknown' }) => {
    // Map status string to CSS class
    const statusClass = (() => {
        const s = status.toLowerCase();
        if (s.includes('idle') || s.includes('ready')) return styles.ready;
        if (s.includes('busy') || s.includes('run')) return styles.busy;
        if (s.includes('pause') || s.includes('hold')) return styles.paused;
        if (s.includes('alarm') || s.includes('error')) return styles.error;
        return styles.unknown;
    })();

    return (
        <div className={styles.container}>
            <div className={clsx(styles.btn, statusClass, { [styles.active]: active })}>
                {label}
                <div className={styles.dot}></div>
            </div>
        </div>
    );
};
