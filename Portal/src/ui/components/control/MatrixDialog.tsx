import React, { useState, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    TextField,
    InputAdornment,
    Stack,
    Checkbox,
    FormControlLabel,
    RadioGroup,
    Radio,
    FormControl,
    FormLabel
} from '@mui/material';
import GridOnIcon from '@mui/icons-material/GridOn';
import FloatingWindow from '../../components/common/FloatingWindow';
import { useCanvasStore } from '../../pages/Recipe/Canvas/useCanvasStore';
import { MatrixOptions, MatrixSnapshot } from '../../../hooks/useMatrixGenerator';
import { useMatrixGenerator } from '../../../hooks/useMatrixGenerator';
import { MatrixRepeater } from '../../pages/Recipe/Canvas/fabric/MatrixRepeater';
import { useShallow } from 'zustand/react/shallow';
import { resolveObjectColorHex } from '../../../utils/colorUtils';

export default function MatrixDialog() {
    const {
        showMatrixDialog, setShowMatrixDialog, canvas, matrixOptions, setMatrixOptions,
        getColorPresetOrDefault,
    } = useCanvasStore(useShallow(s => ({
        showMatrixDialog: s.showMatrixDialog,
        setShowMatrixDialog: s.setShowMatrixDialog,
        canvas: s.canvas,
        matrixOptions: s.matrixOptions,
        setMatrixOptions: s.setMatrixOptions,
        getColorPresetOrDefault: s.getColorPresetOrDefault,
    })));

    const { generateMatrix, clearMatrix, commitMatrix, updateMatrixInPlace, snapshotMatrix, restoreMatrixSnapshot } = useMatrixGenerator();

    // [NEW] Local state for input strings to allow typing signs/decimals without immediate parse reset
    const [localValues, setLocalValues] = useState({
        xSpacing: matrixOptions.xSpacing.toString(),
        ySpacing: matrixOptions.ySpacing.toString(),
        zOffset: matrixOptions.zOffset.toString(),
        xCount: matrixOptions.xCount.toString(),
        yCount: matrixOptions.yCount.toString()
    });

    // [NEW] Create(신규 생성) vs Edit(기존 MatrixRepeater 편집) 모드 구분.
    // modeRef는 effect 실행 순서 내에서 항상 최신값을 동기적으로 참조하기 위함이며,
    // mode(state)는 다이얼로그 타이틀 등 UI 표시 용도로만 사용한다.
    const modeRef = useRef<'create' | 'edit'>('create');
    const [mode, setModeState] = useState<'create' | 'edit'>('create');
    const setMode = (m: 'create' | 'edit') => {
        modeRef.current = m;
        setModeState(m);
    };
    const editTargetRef = useRef<MatrixRepeater | null>(null);
    const snapshotRef = useRef<MatrixSnapshot | null>(null);
    const sessionIdRef = useRef<string>('');

    // [NEW] 다이얼로그가 열릴 때: 선택된 오브젝트가 이미 MatrixRepeater이면 편집 모드로 진입해
    // 기존 값을 폼에 로드하고, 아니면 생성 모드로 진입한다(잔존한 큰 xCount/yCount는 2로 리셋해
    // 예상치 못한 거대 그리드가 즉시 미리보기되는 것을 방지).
    React.useEffect(() => {
        if (!showMatrixDialog) return;

        sessionIdRef.current = `mtx_session_${performance.now()}`;

        const active = canvas?.getActiveObject();
        let initialOptions: MatrixOptions;

        if (active && (active as any).type === 'MatrixRepeater') {
            const repeater = active as unknown as MatrixRepeater;
            editTargetRef.current = repeater;
            snapshotRef.current = snapshotMatrix(repeater);
            setMode('edit');

            const { pxPerMm } = useCanvasStore.getState();
            initialOptions = {
                xCount: repeater.xCount,
                yCount: repeater.yCount,
                xSpacing: repeater.xSpacing / pxPerMm.x,
                ySpacing: repeater.ySpacing / pxPerMm.y,
                useZOffset: !!repeater.zStep,
                zOffset: repeater.zStep || matrixOptions.zOffset,
                type: repeater.isZigzag ? 'zigzag' : 'oneWay',
                showLabels: matrixOptions.showLabels
            };
        } else {
            editTargetRef.current = null;
            snapshotRef.current = null;
            setMode('create');

            initialOptions = (matrixOptions.xCount > 2 || matrixOptions.yCount > 2)
                ? { ...matrixOptions, xCount: 2, yCount: 2 }
                : matrixOptions;
        }

        // [PERF] 값이 실제로 달라질 때만 store를 갱신한다. 매번 setMatrixOptions를 호출하면
        // matrixOptions 참조가 바뀌어 아래 프리뷰 useEffect가 다이얼로그 오픈 시 두 번
        // 연달아 실행되고, generateMatrix()가 비동기(clone 대기)라 두 호출이 겹쳐
        // 매트릭스가 2개 생성되는 경쟁 조건의 트리거가 되었다.
        const isSameOptions = initialOptions === matrixOptions || (
            initialOptions.xCount === matrixOptions.xCount &&
            initialOptions.yCount === matrixOptions.yCount &&
            initialOptions.xSpacing === matrixOptions.xSpacing &&
            initialOptions.ySpacing === matrixOptions.ySpacing &&
            initialOptions.useZOffset === matrixOptions.useZOffset &&
            initialOptions.zOffset === matrixOptions.zOffset &&
            initialOptions.type === matrixOptions.type &&
            initialOptions.showLabels === matrixOptions.showLabels
        );
        if (!isSameOptions) {
            setMatrixOptions(initialOptions);
        }
        setLocalValues({
            xSpacing: initialOptions.xSpacing.toString(),
            ySpacing: initialOptions.ySpacing.toString(),
            zOffset: initialOptions.zOffset.toString(),
            xCount: initialOptions.xCount.toString(),
            yCount: initialOptions.yCount.toString()
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMatrixDialog]);

    // [NEW] 실시간 프리뷰/갱신: 생성 모드는 프리뷰 리피터를 다시 그리고,
    // 편집 모드는 기존 리피터 속성을 in-place로 갱신한다(원본 은닉/삭제 없음).
    React.useEffect(() => {
        if (!showMatrixDialog || !canvas) return;

        if (modeRef.current === 'edit') {
            if (editTargetRef.current) {
                updateMatrixInPlace(canvas, editTargetRef.current, matrixOptions);
            }
        } else {
            generateMatrix(canvas, matrixOptions, true, sessionIdRef.current);
        }
    }, [matrixOptions, canvas, showMatrixDialog]);

    const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleLocalChange = (field: keyof MatrixOptions, value: string) => {
        // 1. Update local UI state
        setLocalValues(prev => ({ ...prev, [field]: value }));

        // 2. Try to update global store if it's a valid number
        // We allow empty string or minus sign to wait for the next digit
        if (value === '' || value === '-' || value === '.') return;

        const numValue = field === 'xCount' || field === 'yCount' ? parseInt(value) : parseFloat(value);
        if (!isNaN(numValue)) {
            let finalValue = numValue;
            if (field === 'xCount' || field === 'yCount') {
                finalValue = Math.min(100, Math.max(1, numValue));
                if (numValue !== finalValue) {
                    setLocalValues(prev => ({ ...prev, [field]: finalValue.toString() }));
                }
            }

            if (debounceTimer.current) clearTimeout(debounceTimer.current);

            debounceTimer.current = setTimeout(() => {
                setMatrixOptions({ [field]: finalValue });
            }, 400);
        }
    };

    const handleClose = () => {
        if (canvas) {
            if (modeRef.current === 'edit' && editTargetRef.current && snapshotRef.current) {
                // [FIX] 편집 모드 Cancel: 오브젝트를 삭제하지 않고 다이얼로그를 열었을 때의
                // 스냅숏 값으로만 되돌린다. 이미 확정된 매트릭스가 사라지는 버그를 방지.
                restoreMatrixSnapshot(canvas, editTargetRef.current, snapshotRef.current);
            } else {
                // [FIX] 생성 모드 Cancel: 이번 다이얼로그 세션에서 만든 프리뷰만 제거.
                clearMatrix(canvas, sessionIdRef.current, true);
            }
        }
        setShowMatrixDialog(false);
    };

    const handleDone = async () => {
        if (!canvas) return;
        if (modeRef.current === 'create') {
            commitMatrix(canvas, sessionIdRef.current); // Convert this session's preview to a real object
        }
        // 편집 모드는 이미 실제 오브젝트에 실시간 반영되어 있으므로 별도 확정 작업이 필요 없다.
        setShowMatrixDialog(false);
    };

    // [NEW] "합산 미리보기": 매트릭스 Z-step은 색상 프리셋의 Z 위에 "더해지는" 값이지 이를
    // 대체하지 않는다. 두 값이 각자 다른 UI(Layer List / Matrix Dialog)에 있어 사용자가
    // 합산 여부를 알기 어렵다는 피드백에 따라, 실제로 적용될 최종 Z를 셀 단위로 미리 보여준다.
    const previewTargetObj = (editTargetRef.current || canvas?.getActiveObject()) as any;
    const previewColor = previewTargetObj ? resolveObjectColorHex(previewTargetObj) : null;
    const colorPresetZ = previewColor
        ? getColorPresetOrDefault(previewColor).zOffset
        : 0;
    const cellStepZ = matrixOptions.useZOffset ? (Number(localValues.zOffset) || 0) : 0;
    const cellCount = Math.max(1, matrixOptions.xCount * matrixOptions.yCount);
    const firstCellZ = colorPresetZ + cellStepZ * 0;
    const lastCellZ = colorPresetZ + cellStepZ * (cellCount - 1);

    if (!showMatrixDialog) return null;

    return (
        <FloatingWindow
            title={mode === 'edit' ? 'Matrix / Grid Array (Edit)' : 'Matrix / Grid Array'}
            icon={<GridOnIcon fontSize="small" color="primary" />}
            onClose={handleClose}
            width={340}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 0.5 }}>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="X-Axis (Columns)"
                        fullWidth
                        size="small"
                        value={localValues.xCount}
                        onChange={(e) => handleLocalChange('xCount', e.target.value)}
                    />
                    <TextField
                        label="X-Spacing"
                        fullWidth
                        size="small"
                        value={localValues.xSpacing}
                        onChange={(e) => handleLocalChange('xSpacing', e.target.value)}
                        InputProps={{
                            endAdornment: <InputAdornment position="end">mm</InputAdornment>,
                        }}
                    />
                </Stack>
                <Stack direction="row" spacing={2}>
                    <TextField
                        label="Y-Axis (Rows)"
                        fullWidth
                        size="small"
                        value={localValues.yCount}
                        onChange={(e) => handleLocalChange('yCount', e.target.value)}
                    />
                    <TextField
                        label="Y-Spacing"
                        fullWidth
                        size="small"
                        value={localValues.ySpacing}
                        onChange={(e) => handleLocalChange('ySpacing', e.target.value)}
                        InputProps={{
                            endAdornment: <InputAdornment position="end">mm</InputAdornment>,
                        }}
                    />
                </Stack>

                <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box sx={{ flex: 1 }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={matrixOptions.useZOffset}
                                    onChange={(e) => setMatrixOptions({ useZOffset: e.target.checked })}
                                />
                            }
                            label="Z-Axis Cumulative Offset"
                        />
                        <TextField
                            fullWidth
                            size="small"
                            disabled={!matrixOptions.useZOffset}
                            value={localValues.zOffset}
                            onChange={(e) => handleLocalChange('zOffset', e.target.value)}
                            InputProps={{
                                endAdornment: <InputAdornment position="end">mm</InputAdornment>,
                            }}
                        />

                        {/* [NEW] Show Labels Checkbox */}
                        <FormControlLabel
                            sx={{ mt: 1 }}
                            control={
                                <Checkbox
                                    checked={matrixOptions.showLabels}
                                    onChange={(e) => setMatrixOptions({ showLabels: e.target.checked })}
                                    size="small"
                                />
                            }
                            label={<Typography variant="caption">Show numbering & Z-info</Typography>}
                        />

                        {/* [NEW] 색상 프리셋 Z + 매트릭스 셀 오프셋 합산 미리보기 */}
                        <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                            <Typography variant="caption" display="block" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                                합산 미리보기 (색상 프리셋 Z + 셀 오프셋)
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                                {colorPresetZ.toFixed(3)} + {cellStepZ.toFixed(3)} × i
                            </Typography>
                            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                                셀 0: {firstCellZ.toFixed(3)}mm → 마지막 셀: {lastCellZ.toFixed(3)}mm
                            </Typography>
                        </Box>
                    </Box>

                    <FormControl component="fieldset" sx={{ flex: 1 }}>
                        <FormLabel component="legend" sx={{ fontSize: '0.875rem' }}>Type</FormLabel>
                        <RadioGroup
                            value={matrixOptions.type}
                            onChange={(e) => setMatrixOptions({ type: e.target.value as any })}
                        >
                            <FormControlLabel value="oneWay" control={<Radio size="small" />} label="One way" />
                            <FormControlLabel value="zigzag" control={<Radio size="small" />} label="Zigzag" />
                        </RadioGroup>
                    </FormControl>
                </Stack>

                <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={1}>
                    <Button variant="outlined" color="inherit" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button variant="contained" color="success" onClick={handleDone}>
                        Apply
                    </Button>
                </Stack>
            </Box>
        </FloatingWindow>
    );
}
