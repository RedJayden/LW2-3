
import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
    useTheme
} from '@mui/material';
import { useAppStore } from '../../store/appStore';

export const ConfirmDialog = () => {
    const theme = useTheme();

    // Connect to global store
    const { open, title, message, confirmText, cancelText, showCancel, onConfirm, onCancel, type } = useAppStore(state => state.dialog);
    const closeDialog = useAppStore(state => state.closeDialog);

    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        closeDialog();
    };

    const handleCancel = () => {
        if (onCancel) onCancel();
        closeDialog();
    };

    // Default texts
    const cText = confirmText || "Yes"; // Default to "Yes" per user preference ("Yes" button mainly)
    // For "No" button, if showCancel is true, we default to "No"
    const showCancelBtn = showCancel !== false; // Default true unless explicitly false? 
    // Wait, user said: "No, Yes 보여지는 것을 용도에 따라 선택 할 수 도 있게" -> implies customizable visibility
    // If undefined, let's assume showCancel is true for 'confirm' type semantics, but maybe false for 'info'.
    // However, `showCancel` in store defaults to undefined.

    const isInfo = type === 'info';
    const shouldShowCancel = showCancel !== undefined ? showCancel : !isInfo;
    const cCancelText = cancelText || "No";

    return (
        <Dialog
            open={open}
            onClose={handleCancel}
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
            sx={{
                '& .MuiDialog-container': {
                    alignItems: 'flex-end',
                    justifyContent: 'flex-end',
                }
            }}
            PaperProps={{
                style: {
                    backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff', // slate-800 or white
                    color: theme.palette.text.primary,
                    minWidth: '300px',
                    margin: '32px' // Spacing from edges
                }
            }}
        >
            <DialogTitle id="confirm-dialog-title" sx={{ fontWeight: 'bold' }}>
                {title}
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="confirm-dialog-description" sx={{ color: theme.palette.text.secondary }}>
                    {message}
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ padding: 2 }}>
                {shouldShowCancel && (
                    <Button onClick={handleCancel} color="inherit" sx={{ fontWeight: 'bold' }}>
                        {cCancelText}
                    </Button>
                )}
                <Button onClick={handleConfirm} variant="contained" autoFocus color="primary" sx={{ fontWeight: 'bold' }}>
                    {cText}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
