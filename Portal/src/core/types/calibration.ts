export type CalibrationProfile = 'scanner' | 'object_x20' | 'object_x50';

export interface CalibrationMeta {
    timestamp: string;
    operator: string;
    profile: CalibrationProfile;
    camera: {
        serial?: string;
        model?: string;
        interface?: string;
    };
    lens?: string;
    imageCondition?: {
        exposure?: number;
        gain?: number;
        [key: string]: any;
    };
    lightCondition?: any;
    roi?: { x: number; y: number; w: number; h: number };
    target?: string;
}

export interface CalibrationResult {
    scale_um_per_px: number;
    scale_um_per_py?: number;
    rotation_deg?: number;
    distortion?: {
        k1?: number;
        k2?: number;
        p1?: number;
        p2?: number;
        k3?: number;
    };
    rms?: number;
}

export interface CalibrationData {
    meta: CalibrationMeta;
    calibration: CalibrationResult;
}

export interface CalibrationIndexItem {
    filename: string;
    timestamp: string;
    operator: string;
    rms?: number;
    pass?: boolean;
}
