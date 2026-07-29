import React, { useState } from 'react';
import { Box, Typography, TextField, Button, IconButton, Stack, Divider } from '@mui/material';
import BookmarksIcon from '@mui/icons-material/Bookmarks';
import DeleteIcon from '@mui/icons-material/Delete';
import FloatingWindow from '../common/FloatingWindow';
import { useCanvasStore } from '../../pages/Recipe/Canvas/useCanvasStore';
import useAppStore from '../../../store/appStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * @brief 색상 프리셋 라이브러리 관리 창.
 * @details 현재 CurrentLayer 색상의 프리셋을 이름 붙여 전역 라이브러리에 저장하거나,
 *          기존 라이브러리 프리셋을 CurrentLayer 색상에 적용/삭제한다.
 *          MatrixDialog.tsx와 동일한 FloatingWindow 골격을 사용한다.
 */
export default function PresetLibraryDialog() {
    const {
        showPresetLibraryDialog, setShowPresetLibraryDialog,
        currentLayerColor, presetLibrary,
        saveColorAsLibraryPreset, deleteLibraryPreset, applyLibraryPresetToColor,
        savePresetLibraryData,
    } = useCanvasStore(useShallow(s => ({
        showPresetLibraryDialog: s.showPresetLibraryDialog,
        setShowPresetLibraryDialog: s.setShowPresetLibraryDialog,
        currentLayerColor: s.currentLayerColor,
        presetLibrary: s.presetLibrary,
        saveColorAsLibraryPreset: s.saveColorAsLibraryPreset,
        deleteLibraryPreset: s.deleteLibraryPreset,
        applyLibraryPresetToColor: s.applyLibraryPresetToColor,
        savePresetLibraryData: s.savePresetLibraryData,
    })));

    const [newName, setNewName] = useState('');

    if (!showPresetLibraryDialog) return null;

    const handleSaveAsNew = async () => {
        if (!currentLayerColor || !newName.trim()) return;
        saveColorAsLibraryPreset(currentLayerColor, newName.trim());
        setNewName('');
        await savePresetLibraryData();
    };

    const handleApply = async (name: string) => {
        if (!currentLayerColor) return;
        applyLibraryPresetToColor(currentLayerColor, name);
        useAppStore.getState().showToast(`"${name}" 프리셋을 ${currentLayerColor.toUpperCase()} 레이어에 적용했습니다`, 'success');
    };

    const handleDelete = async (name: string) => {
        deleteLibraryPreset(name);
        await savePresetLibraryData();
    };

    return (
        <FloatingWindow
            title="Preset Library"
            icon={<BookmarksIcon fontSize="small" color="primary" />}
            onClose={() => setShowPresetLibraryDialog(false)}
            width={320}
            height={420}
        >
            <Stack spacing={1.5}>
                <Typography variant="caption" color="text.secondary">
                    {currentLayerColor
                        ? `현재 레이어(${currentLayerColor.toUpperCase()})의 프리셋을 저장하거나, 아래 "적용" 버튼으로 라이브러리 프리셋을 이 레이어에 불러옵니다.`
                        : '먼저 우측 CurrentLayer에서 색상을 선택하세요.'}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        size="small"
                        placeholder="새 프리셋 이름"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        fullWidth
                        disabled={!currentLayerColor}
                    />
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleSaveAsNew}
                        disabled={!currentLayerColor || !newName.trim()}
                    >
                        저장
                    </Button>
                </Box>

                <Divider />

                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>저장된 프리셋</Typography>
                {presetLibrary.length === 0 && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        저장된 프리셋이 없습니다.
                    </Typography>
                )}
                {presetLibrary.map((p) => (
                    <Box
                        key={p.name}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 1, p: 0.75,
                            borderRadius: 1, bgcolor: 'action.hover'
                        }}
                    >
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap>{p.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                                {p.markTimes}x · {p.markSpeed}mm/s · {p.power}% · Z{p.zOffset}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={!currentLayerColor}
                            onClick={() => handleApply(p.name!)}
                            sx={{ flexShrink: 0, minWidth: 0, px: 1 }}
                        >
                            적용
                        </Button>
                        <IconButton size="small" title="삭제" onClick={() => handleDelete(p.name!)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ))}
            </Stack>
        </FloatingWindow>
    );
}
