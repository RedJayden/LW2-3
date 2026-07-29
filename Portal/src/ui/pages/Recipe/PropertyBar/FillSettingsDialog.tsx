import React from 'react';
import {
    Box,
    Typography,
    Checkbox,
    TextField,
    InputAdornment,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Divider
} from '@mui/material';
import { IFillSettings } from '../../../../types/cad';
import { useTheme } from '@mui/material/styles';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import FloatingWindow from '../../../components/common/FloatingWindow';

interface FillSettingsDialogProps {
    settings: IFillSettings;
    onChange: (settings: IFillSettings) => void;
    onClose: () => void;
}

export default function FillSettingsDialog({ settings, onChange, onClose }: FillSettingsDialogProps) {
    const theme = useTheme();

    const handleChange = (key: keyof IFillSettings, value: any) => {
        onChange({ ...settings, [key]: value });
    };

    const handleNumberChange = (key: keyof IFillSettings, value: string) => {
        const num = Number(value);
        if (!isNaN(num)) {
            handleChange(key, num);
        }
    };

    return (
        <FloatingWindow
            title="Fill & Outline"
            icon={<FormatColorFillIcon fontSize="small" color="primary" />}
            onClose={onClose}
            width={320}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 0.5 }}>
                {/* Profile (Outline) Section */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Checkbox
                        size="small"
                        checked={settings.enableProfile}
                        onChange={(e) => handleChange('enableProfile', e.target.checked)}
                        sx={{ p: 0 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Enable Profile (Outline)</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, pl: 3, opacity: settings.enableProfile ? 1 : 0.5, pointerEvents: settings.enableProfile ? 'auto' : 'none' }}>
                    <FormControl size="small" fullWidth>
                        <InputLabel sx={{ fontSize: '12px', top: -4 }}>Start Point</InputLabel>
                        <Select
                            value={settings.profileStartPoint}
                            label="Start Point"
                            onChange={(e) => handleChange('profileStartPoint', e.target.value)}
                            sx={{ fontSize: '13px', height: 32 }}
                        >
                            <MenuItem value="LT"><Typography variant="caption">Left-Top</Typography></MenuItem>
                            <MenuItem value="LB"><Typography variant="caption">Left-Bottom</Typography></MenuItem>
                            <MenuItem value="RT"><Typography variant="caption">Right-Top</Typography></MenuItem>
                            <MenuItem value="RB"><Typography variant="caption">Right-Bottom</Typography></MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            </Box>

            <Divider />

            {/* General Progression Section */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 3 }}>
                <FormControl size="small" fullWidth>
                    <InputLabel sx={{ fontSize: '12px', top: -4 }}>Progression (Sweep / Outline Dir)</InputLabel>
                    <Select
                        value={settings.fillProgression}
                        label="Progression (Sweep / Outline Dir)"
                        onChange={(e) => handleChange('fillProgression', e.target.value)}
                        sx={{ fontSize: '13px', height: 32 }}
                    >
                        <MenuItem value="L2R"><Typography variant="caption">Left to Right</Typography></MenuItem>
                        <MenuItem value="R2L"><Typography variant="caption">Right to Left</Typography></MenuItem>
                        <MenuItem value="T2B"><Typography variant="caption">Top to Bottom</Typography></MenuItem>
                        <MenuItem value="B2T"><Typography variant="caption">Bottom to Top</Typography></MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Divider />

            {/* Fill Section */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Checkbox
                        size="small"
                        checked={settings.enableFill}
                        onChange={(e) => handleChange('enableFill', e.target.checked)}
                        sx={{ p: 0 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Enable Fill (Hatching)</Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 3, opacity: settings.enableFill ? 1 : 0.5, pointerEvents: settings.enableFill ? 'auto' : 'none' }}>

                    {/* Method & Progression */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '12px', top: -4 }}>Fill Type</InputLabel>
                            <Select
                                value={settings.fillType}
                                label="Fill Type"
                                onChange={(e) => handleChange('fillType', e.target.value)}
                                sx={{ fontSize: '13px', height: 48 }}
                            >
                                <MenuItem value="OneWay">
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <path d="M4 6h16 M4 10h16 M4 14h16 M4 18h16" strokeDasharray="2 2" strokeOpacity="0.3" />
                                            <path d="M4 6h14l-2-2 M18 6l-2 2 M4 10h14l-2-2 M18 10l-2 2 M4 14h14l-2-2 M18 14l-2 2 M4 18h14l-2-2 M18 18l-2 2" stroke="#4fc3f7" strokeWidth="1" />
                                        </svg>
                                        <Box>
                                            <Typography variant="body2" sx={{ lineHeight: 1.2 }}>One-way</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>Left to Right</Typography>
                                        </Box>
                                    </Box>
                                </MenuItem>
                                <MenuItem value="TwoWay">
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <path d="M4 6h14l-2-2 M18 6l-2 2 M20 10H6l2-2 M6 10l2 2 M4 14h14l-2-2 M18 14l-2 2 M20 18H6l2-2 M6 18l2 2" stroke="#4fc3f7" strokeWidth="1" />
                                        </svg>
                                        <Box>
                                            <Typography variant="body2" sx={{ lineHeight: 1.2 }}>Two-way</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>Zigzag</Typography>
                                        </Box>
                                    </Box>
                                </MenuItem>
                                <MenuItem value="OptimizedTwoWay">
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <path d="M4 6h16v4H4v4h16v4H4" stroke="#4fc3f7" strokeWidth="1.5" strokeLinejoin="round" />
                                        </svg>
                                        <Box>
                                            <Typography variant="body2" sx={{ lineHeight: 1.2 }}>Optimized Two-way</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>Connected ends</Typography>
                                        </Box>
                                    </Box>
                                </MenuItem>
                                <MenuItem value="OptimizedBow">
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <path d="M4 6h16 M20 6v4 M20 10H4 M4 10v4 M4 14h16 M20 14v4 M20 18H4" stroke="#4fc3f7" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3 3" />
                                        </svg>
                                        <Box>
                                            <Typography variant="body2" sx={{ lineHeight: 1.2 }}>Optimized Bow</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>Skips blank areas</Typography>
                                        </Box>
                                    </Box>
                                </MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Numeric Settings */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <TextField
                            size="small"
                            label="Angle"
                            type="number"
                            value={settings.angle}
                            onChange={(e) => handleNumberChange('angle', e.target.value)}
                            InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }}
                            InputProps={{
                                style: { fontSize: 13, height: 32 }
                            }}
                            sx={{
                                '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                    opacity: 1,
                                    ml: 0
                                }
                            }}
                        />
                        <TextField
                            size="small"
                            label="Line Spacing"
                            type="number"
                            inputProps={{ step: 0.001 }}
                            value={settings.lineSpacing ?? ''}
                            onChange={(e) => handleNumberChange('lineSpacing', e.target.value)}
                            InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }}
                            InputProps={{
                                endAdornment: <InputAdornment position="end" sx={{ mr: -0.5 }}><Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary' }}>mm</Typography></InputAdornment>,
                                style: { fontSize: 13, height: 32 }
                            }}
                            sx={{
                                '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                    opacity: 1,
                                    ml: 0
                                }
                            }}
                        />
                        <TextField
                            size="small"
                            label="Margin"
                            type="number"
                            inputProps={{ step: 0.001 }}
                            value={settings.margin ?? ''}
                            onChange={(e) => handleNumberChange('margin', e.target.value)}
                            InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }}
                            InputProps={{
                                endAdornment: <InputAdornment position="end" sx={{ mr: -0.5 }}><Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary' }}>mm</Typography></InputAdornment>,
                                style: { fontSize: 13, height: 32 }
                            }}
                            sx={{
                                '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                    opacity: 1,
                                    ml: 0
                                }
                            }}
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
        </FloatingWindow>
    );

}

