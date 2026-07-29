/**
 * @file motion-config.ts
 * @brief Interfaces for Motion Configuration (Axis & Speed)
 */

export interface SpeedProfile {
    velocity: number;   // um/sec
    accel_time: number; // msec
}

export interface AxisConfig {
    name: string; // e.g., "X", "Y", "Z"

    // Calibration & Offset
    scale_unit: number;     // Scale Unit
    gcode_offset: number;   // Gcode Offset
    home_offset: number;    // Home Offset

    // Limits & Safety
    limit_used: boolean;    // Limit Enable/Disable
    limit_min: number;      // HW Limit Min
    limit_max: number;      // HW Limit Max
    interlock_min: number;  // SW Interlock Min
    interlock_max: number;  // SW Interlock Max

    // Legacy / Internal (Hidden but kept for backend compatibility if needed)
    lead: number;
    home_direction: number;
    home_speed_fast: number;
    home_speed_slow: number;

    // Dynamics (Per Axis)
    speeds: {
        slow: SpeedProfile;
        mid: SpeedProfile;
        fast: SpeedProfile;
    };
}

export interface MotionConfig {
    axes: AxisConfig[];
}

const DEFAULT_SPEEDS = {
    slow: { velocity: 10, accel_time: 100 },
    mid: { velocity: 100, accel_time: 200 },
    fast: { velocity: 300, accel_time: 300 },
};

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
    axes: [
        {
            name: "X", lead: 10, scale_unit: 0.001, gcode_offset: 0, home_offset: 0,
            limit_used: true, limit_min: 0, limit_max: 300,
            interlock_min: 0, interlock_max: 300,
            home_direction: -1, home_speed_fast: 50, home_speed_slow: 5,
            speeds: JSON.parse(JSON.stringify(DEFAULT_SPEEDS))
        },
        {
            name: "Y", lead: 10, scale_unit: 0.001, gcode_offset: 0, home_offset: 0,
            limit_used: true, limit_min: 0, limit_max: 300,
            interlock_min: 0, interlock_max: 300,
            home_direction: -1, home_speed_fast: 50, home_speed_slow: 5,
            speeds: JSON.parse(JSON.stringify(DEFAULT_SPEEDS))
        },
        {
            name: "Z", lead: 4, scale_unit: 0.0001, gcode_offset: 0, home_offset: 0,
            limit_used: true, limit_min: 0, limit_max: 50,
            interlock_min: 0, interlock_max: 50,
            home_direction: 1, home_speed_fast: 10, home_speed_slow: 2,
            speeds: {
                slow: { velocity: 5, accel_time: 100 },
                mid: { velocity: 20, accel_time: 200 },
                fast: { velocity: 50, accel_time: 300 }
            }
        },
    ]
};
