import React, { useEffect } from 'react';
import { Box, Typography, Checkbox, TextField, InputAdornment, IconButton, Tooltip } from '@mui/material';
import BookmarksIcon from '@mui/icons-material/Bookmarks';
import CheckIcon from '@mui/icons-material/Check';
import * as fabric from 'fabric';
import { useCanvasStore } from '../../pages/Recipe/Canvas/useCanvasStore';
import { useCanvasColorGroups } from '../../../hooks/useCanvasColorGroups';
import { IColorPreset } from '../../../types/cad';
import { useShallow } from 'zustand/react/shallow';

interface ColorPresetPanelProps {
    /** 전역 Shape Delay를 읽고 쓸 설정 슬롯: 스캐너 모드(갈보)는 scannerSettings, 오브젝트 모드는 gcodeSettings. */
    mode: 'scanner' | 'gcode';
}

/**
 * @component ColorPresetPanel
 * @brief 색상(레이어)별 가공 프리셋(Mark Times/Speed/Power/Z) 편집 블록 + 전역 Shape Delay.
 * @details Scanner Process/Object Process 탭 상단(Mark Speed 자리)에 공통으로 삽입되는
 *          공유 컴포넌트. CurrentLayer 팔레트 + Use Default Parameters + 프리셋 미니폼 +
 *          라이브러리 버튼을 포함한다. LayerList.tsx는 순수 도형 트리로만 남기고, 실제
 *          프리셋 편집은 이 컴포넌트 하나로 일원화한다.
 *          Shape Delay는 색상별이 아니라 전역 설정이다(반복 가공 시 한 가공과 다음 가공
 *          사이의 대기 시간, 초 단위, 기본값 0 = 지연 없이 바로 다음 가공).
 */
export default function ColorPresetPanel({ mode }: ColorPresetPanelProps) {
    const layers = useCanvasColorGroups();
    const {
        layerNames, setColorPreset, getColorPresetOrDefault,
        currentLayerColor, setCurrentLayerColor,
        useDefaultParameters, setUseDefaultParameters,
        setShowPresetLibraryDialog,
        scannerShapeDelay, gcodeShapeDelay,
        setScannerSettings, setGcodeSettings,
        viewMode, magnification,
    } = useCanvasStore(useShallow(s => ({
        layerNames: s.layerNames,
        setColorPreset: s.setColorPreset,
        getColorPresetOrDefault: s.getColorPresetOrDefault,
        currentLayerColor: s.currentLayerColor,
        setCurrentLayerColor: s.setCurrentLayerColor,
        useDefaultParameters: s.useDefaultParameters,
        setUseDefaultParameters: s.setUseDefaultParameters,
        setShowPresetLibraryDialog: s.setShowPresetLibraryDialog,
        scannerShapeDelay: s.scannerSettings.shapeDelay,
        gcodeShapeDelay: s.gcodeSettings.shapeDelay,
        setScannerSettings: s.setScannerSettings,
        setGcodeSettings: s.setGcodeSettings,
        // [FIX] colorPresets는 이제 scanner/object_x20/object_x50 스코프별로 분리 관리된다.
        // viewMode/magnification을 구독해야 모드 전환 시 preset이 올바른 스코프로 다시 계산된다.
        viewMode: s.viewMode,
        magnification: s.magnification,
    })));

    const shapeDelay = mode === 'scanner' ? scannerShapeDelay : gcodeShapeDelay;
    const setShapeDelay = (v: number) => {
        if (mode === 'scanner') setScannerSettings({ shapeDelay: v });
        else setGcodeSettings({ shapeDelay: v });
    };

    // CurrentLayer 기본값 + 재검증: 선택이 없거나, 캔버스 교체(도형 삭제 후 DXF 로드 등)로 현재
    // 선택 색상이 레이어 목록에 더 이상 존재하지 않으면(유령 키) 첫 번째 레이어 색상으로 재지정한다.
    // [FIX 2026-07-23 ScannerIssue8 S3] 기존에는 null일 때만 자동 지정해서, 캔버스 내용이 통째로
    // 바뀌어도 currentLayerColor가 옛 색상으로 남았다. 그 상태에서 프리셋을 편집하면 화면에 없는
    // 유령 색상 키에 저장되고(스와치 선택 표시도 없음), 가공 생성(groupByColorPreset)은 실제 도형
    // 색으로 조회해 미스 → Mark Times/Speed가 기본값(1회/1mm/s)으로 떨어졌다(해마 DXF 2회 설정이
    // 1회로 가공된 원인). 도형이 하나도 없으면 선택을 소거해 유령 잔존을 차단한다.
    useEffect(() => {
        if (layers.length === 0) {
            if (currentLayerColor) setCurrentLayerColor(null);
            return;
        }
        if (!currentLayerColor || !layers.some(l => l.color === currentLayerColor)) {
            setCurrentLayerColor(layers[0].color);
        }
    }, [currentLayerColor, layers, setCurrentLayerColor]);

    const preset: IColorPreset | null = currentLayerColor
        ? getColorPresetOrDefault(currentLayerColor)
        : null;

    /**
     * @brief 스와치 클릭: CurrentLayer 지정 + 해당 색상 도형을 캔버스에서 선택 표시.
     * @details Layer List에서 레이어를 클릭하면 캔버스에 선택이 표시되는 것과 동일한 피드백을
     *          제공한다(LayerList.handleSelectLayer의 단일 레이어 선택과 같은 규칙 — 잠긴 도형이
     *          섞여 있으면 이동/변형 잠금 상태의 ActiveSelection으로 묶는다). 가공 중(오버레이
     *          은닉)에는 도형이 evented=false이므로 선택을 시도하지 않는다.
     */
    const handleSwatchClick = (layer: { color: string; objs: fabric.Object[] }) => {
        setCurrentLayerColor(layer.color);

        const { canvas, isProcessingLocal, hideOverlays } = useCanvasStore.getState();
        if (!canvas || isProcessingLocal || hideOverlays || layer.objs.length === 0) return;

        canvas.discardActiveObject();
        if (layer.objs.length === 1) {
            canvas.setActiveObject(layer.objs[0]);
        } else {
            const isLocked = layer.objs.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
            const selection = new fabric.ActiveSelection(layer.objs, {
                canvas,
                lockMovementX: isLocked,
                lockMovementY: isLocked,
                lockRotation: isLocked,
                lockScalingX: isLocked,
                lockScalingY: isLocked,
                hasControls: !isLocked,
            });
            canvas.setActiveObject(selection);
        }
        canvas.requestRenderAll();
    };

    const numberFieldSx = {
        '& input[type=number]': { MozAppearance: 'textfield' },
        '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
        },
    } as const;

    // Mark Speed/Mark Times는 한 줄에 두 칸씩, Shape Delay가 그 다음 칸, Z만 전체 폭.
    // [TEMP HIDE 2026-07-23] Power 입력창 임시 숨김 — 레이저 파워 제어 기능이 아직 미구현이라
    // 사용자 혼동을 막기 위해 UI만 감춘다. 데이터 모델(IColorPreset.power)과 SET_PARAM 방출
    // 로직은 그대로 유지되며, 기능 구현 시 아래 주석의 항목을 배열에 복원하면 된다.
    // (docs/checkpoints/process preset.md §11 참고)
    const fields: { key: keyof IColorPreset; label: string; unit: string; step?: number }[] = [
        { key: 'markSpeed', label: 'Mark Speed', unit: 'mm/s' },
        { key: 'markTimes', label: 'Mark Times', unit: '회' },
        // { key: 'power', label: 'Power', unit: '%' },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                    Current Layer
                </Typography>
                <IconButton size="small" title="Preset Library" onClick={() => setShowPresetLibraryDialog(true)} sx={{ p: 0.5 }}>
                    <BookmarksIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 0.5, px: 0.25 }}>
                {layers.length === 0 && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        도형이 없습니다
                    </Typography>
                )}
                {layers.map((layer) => {
                    // [UX] 선택 상태를 채움색과 무관하게 또렷하게 표현:
                    //  - 배경색 gap + primary 링(이중 box-shadow)으로 어떤 색 위에서도 구분
                    //  - 살짝 확대(scale) + 중앙 체크(✓) 아이콘으로 선택을 명시
                    const selected = currentLayerColor === layer.color;
                    return (
                        <Box
                            key={layer.color}
                            onClick={() => handleSwatchClick(layer)}
                            title={layerNames[layer.color] || layer.color}
                            sx={(theme) => ({
                                position: 'relative',
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                bgcolor: layer.color,
                                cursor: 'pointer',
                                boxSizing: 'border-box',
                                border: '1px solid',
                                borderColor: selected ? 'transparent' : 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'transform 120ms ease, box-shadow 120ms ease',
                                transform: selected ? 'scale(1.15)' : 'scale(1)',
                                boxShadow: selected
                                    ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}`
                                    : 'none',
                                '&:hover': {
                                    transform: selected ? 'scale(1.15)' : 'scale(1.08)',
                                    opacity: 0.9,
                                },
                            })}
                        >
                            {selected && (
                                <CheckIcon
                                    sx={{
                                        fontSize: 13,
                                        color: '#fff',
                                        filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.9))',
                                    }}
                                />
                            )}
                        </Box>
                    );
                })}
            </Box>

            <Box
                onClick={() => currentLayerColor && setUseDefaultParameters(!useDefaultParameters)}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: currentLayerColor ? 'pointer' : 'not-allowed', opacity: currentLayerColor ? 1 : 0.5 }}
            >
                <Checkbox
                    size="small"
                    checked={useDefaultParameters}
                    disabled={!currentLayerColor}
                    sx={{ p: 0.25 }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => setUseDefaultParameters(!useDefaultParameters)}
                />
                <Typography variant="caption">Use Default Parameters</Typography>
            </Box>

            {preset && currentLayerColor && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                    {fields.map((f) => (
                        <TextField
                            key={f.key}
                            label={f.label}
                            type="number"
                            size="small"
                            fullWidth
                            value={preset[f.key] as number}
                            inputProps={{ step: f.step ?? 1 }}
                            InputProps={{ endAdornment: <InputAdornment position="end">{f.unit}</InputAdornment> }}
                            sx={numberFieldSx}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setColorPreset(currentLayerColor, { [f.key]: isNaN(v) ? 0 : v } as Partial<IColorPreset>);
                            }}
                        />
                    ))}

                    <Tooltip title="반복 가공 시 다음 가공까지 대기 시간 (0 = 지연 없음)" placement="top" arrow>
                        <TextField
                            label="Shape Delay"
                            type="number"
                            size="small"
                            fullWidth
                            value={shapeDelay}
                            inputProps={{ step: 0.001, min: 0 }}
                            InputProps={{ endAdornment: <InputAdornment position="end">sec</InputAdornment> }}
                            sx={numberFieldSx}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setShapeDelay(isNaN(v) || v < 0 ? 0 : v);
                            }}
                        />
                    </Tooltip>

                    <TextField
                        label="Z"
                        type="number"
                        size="small"
                        fullWidth
                        value={preset.zOffset}
                        inputProps={{ step: 0.001 }}
                        InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
                        sx={{ gridColumn: 'span 2', ...numberFieldSx }}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setColorPreset(currentLayerColor, { zOffset: isNaN(v) ? 0 : v });
                        }}
                    />
                </Box>
            )}
        </Box>
    );
}
