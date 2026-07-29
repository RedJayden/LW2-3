import React from 'react';
import { Menu, Paper, MenuList, MenuItem, ListItemText, ListItemIcon, Typography, Divider } from '@mui/material';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import GridOnIcon from '@mui/icons-material/GridOn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import UngroupIcon from '@mui/icons-material/LayersClear';

import GpsFixedIcon from '@mui/icons-material/GpsFixed';

interface CanvasContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onMove: (x: number, y: number) => void;
    showGrid: boolean;
    onToggleGrid: () => void;
    showCross: boolean;
    onToggleCross: () => void;
    showCameraGrid: boolean;
    onToggleCameraGrid: () => void;
    showCameraCross: boolean;
    onToggleCameraCross: () => void;
    showHidden: boolean;
    onToggleHidden: () => void;
    activeTool?: string;
    measureMode?: string;
    onCompletePolyline?: () => void;
    onCompletePolylineShape?: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onCut: () => void;
    onSelectAll: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onDeleteAll: () => void;
    onClearMeasurements: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    canGroup?: boolean;
    canUngroup?: boolean;
}

export default function CanvasContextMenu({ x, y, onClose, onMove, showGrid, onToggleGrid, showCross, onToggleCross, showCameraGrid, onToggleCameraGrid, showCameraCross, onToggleCameraCross, showHidden, onToggleHidden, activeTool, measureMode, onCompletePolyline, onCompletePolylineShape, onCopy, onPaste, onCut, onSelectAll, onUndo, onRedo, onDeleteAll, onClearMeasurements, onGroup, onUngroup, canGroup, canUngroup }: CanvasContextMenuProps) {
    return (
        <Menu
            open={true}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={{ top: y, left: x }}
            MenuListProps={{
                dense: true,
                sx: { py: 0.5, outline: 'none' }
            }}
            PaperProps={{
                sx: {
                    width: 280,
                    bgcolor: '#1e1e1e',
                    color: '#e0e0e0',
                    borderRadius: 2, // Rounded corners (8px)
                    border: '1px solid #333', // Subtle border
                    boxShadow: '0px 8px 24px rgba(0,0,0,0.5)', // Deep shadow
                    overflow: 'hidden', // Ensure items stay within rounded corners
                },
                onContextMenu: (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
            slotProps={{
                backdrop: {
                    onContextMenu: (e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onMove(e.clientX, e.clientY);
                    }
                }
            }}
            transitionDuration={200}
            onClick={(e) => e.stopPropagation()}
        >
                {activeTool === 'measure' && measureMode === 'polyline' && onCompletePolyline && (
                    <>
                        <MenuItem onClick={() => { onCompletePolyline(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                            <ListItemIcon>
                                <CheckIcon sx={{ color: '#00ff00', fontSize: 20 }} />
                            </ListItemIcon>
                            <ListItemText primary="Complete Polyline" />
                        </MenuItem>
                        <Divider sx={{ bgcolor: '#333' }} />
                    </>
                )}
                {activeTool === 'polyline-shape' && onCompletePolylineShape && (
                    <>
                        <MenuItem onClick={() => { onCompletePolylineShape(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                            <ListItemIcon>
                                <CheckIcon sx={{ color: '#00ff00', fontSize: 20 }} />
                            </ListItemIcon>
                            <ListItemText primary="Complete Shape" />
                        </MenuItem>
                        <Divider sx={{ bgcolor: '#333' }} />
                    </>
                )}

                {/* Grouping */}
                <MenuItem onClick={() => { onGroup?.(); onClose(); }} disabled={!canGroup} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <GroupWorkIcon sx={{ color: canGroup ? '#e0e0e0' : '#555', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText primary="Group" />
                    <Typography variant="caption" sx={{ color: '#888', ml: 2 }}>Ctrl+G</Typography>
                </MenuItem>
                <MenuItem onClick={() => { onUngroup?.(); onClose(); }} disabled={!canUngroup} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <UngroupIcon sx={{ color: canUngroup ? '#e0e0e0' : '#555', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText primary="Ungroup" />
                    <Typography variant="caption" sx={{ color: '#888', ml: 2 }}>Ctrl+Shift+G</Typography>
                </MenuItem>
                <Divider sx={{ bgcolor: '#333' }} />

                <MenuItem onClick={() => { onCopy(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <ContentCopyIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Copy</ListItemText>
                    <Typography variant="body2" color="text.secondary" sx={{ color: '#666' }}>Ctrl+C</Typography>
                </MenuItem>
                <MenuItem onClick={() => { onPaste(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <ContentPasteIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Paste</ListItemText>
                    <Typography variant="body2" color="text.secondary" sx={{ color: '#666' }}>Ctrl+V</Typography>
                </MenuItem>
                <MenuItem onClick={() => { onCut(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <ContentCutIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Cut</ListItemText>
                    <Typography variant="body2" color="text.secondary" sx={{ color: '#666' }}>Ctrl+X</Typography>
                </MenuItem>
                <MenuItem onClick={() => { onSelectAll(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <SelectAllIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Select All</ListItemText>
                    <Typography variant="body2" color="text.secondary" sx={{ color: '#666' }}>Ctrl+A</Typography>
                </MenuItem>
                <MenuItem onClick={() => { onDeleteAll(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <DeleteIcon sx={{ color: '#ff4444', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText primary="Delete All Shapes" />
                </MenuItem>
                <MenuItem onClick={() => { onClearMeasurements(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <DeleteIcon sx={{ color: '#ff8800', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText primary="Clear All Measurements" />
                </MenuItem>
                <Divider sx={{ bgcolor: '#333' }} />
                <MenuItem onClick={() => { onUndo(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <UndoIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Undo</ListItemText>
                    <Typography variant="body2" color="text.secondary" sx={{ color: '#666' }}>Ctrl+Z</Typography>
                </MenuItem>
                <MenuItem onClick={() => { onRedo(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <RedoIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Redo</ListItemText>
                    <Typography variant="body2" color="text.secondary" sx={{ color: '#666' }}>Ctrl+Y</Typography>
                </MenuItem>
                <Divider sx={{ bgcolor: '#333' }} />
                <MenuItem onClick={() => { onToggleGrid(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <GridOnIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Show/Hide Grid - Stage</ListItemText>
                    {showGrid && <CheckIcon sx={{ color: '#aaa', fontSize: 16 }} />}
                </MenuItem>
                <MenuItem onClick={() => { onToggleCross(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <GpsFixedIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Show/Hide Cross - Stage</ListItemText>
                    {showCross && <CheckIcon sx={{ color: '#aaa', fontSize: 16 }} />}
                </MenuItem>
                <Divider sx={{ bgcolor: '#333' }} />
                <MenuItem onClick={() => { onToggleCameraGrid(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <GridOnIcon sx={{ color: '#5dade2', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Show/Hide Grid - Camera</ListItemText>
                    {showCameraGrid && <CheckIcon sx={{ color: '#5dade2', fontSize: 16 }} />}
                </MenuItem>
                <MenuItem onClick={() => { onToggleCameraCross(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <GpsFixedIcon sx={{ color: '#5dade2', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Show/Hide Cross - Camera</ListItemText>
                    {showCameraCross && <CheckIcon sx={{ color: '#5dade2', fontSize: 16 }} />}
                </MenuItem>
                <Divider sx={{ bgcolor: '#333' }} />
                <MenuItem onClick={() => { onToggleHidden(); onClose(); }} sx={{ '&:hover': { bgcolor: '#333' } }}>
                    <ListItemIcon>
                        <VisibilityIcon sx={{ color: '#aaa', fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText>Show Hidden Objects</ListItemText>
                    {showHidden && <CheckIcon sx={{ color: '#aaa', fontSize: 16 }} />}
                </MenuItem>
        </Menu>
    );
}
