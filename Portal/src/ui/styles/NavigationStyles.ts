import { CSSObject, Theme } from "@mui/material/styles";

/**
 * Shared styles for Navigation Buttons (Toolbar & LeftNav)
 */

export const NavStyles = {
    // Icon Button (Collapsed State)
    iconButton: (theme: Theme, active: boolean): CSSObject => ({
        borderRadius: theme.shape.borderRadius, // 4px usually
        width: 44,
        height: 44,
        minWidth: 0,
        padding: 0,
        margin: '0 auto', // Center horizontally in drawer
        display: 'flex', // Ensure flex container for centering
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? theme.palette.primary.main : theme.palette.text.primary,
        backgroundColor: active ? theme.palette.action.selected : 'transparent',
        '&:hover': {
            backgroundColor: active ? theme.palette.action.selected : theme.palette.action.hover,
        },
    }),

    // Full Button (Expanded State)
    fullButton: (theme: Theme, active: boolean): CSSObject => ({
        justifyContent: 'flex-start',
        paddingLeft: theme.spacing(2.5), // 20px
        paddingRight: theme.spacing(2.5),
        paddingTop: theme.spacing(1), // 8px
        paddingBottom: theme.spacing(1),
        minHeight: 48, // Standard height
        width: '100%',
        textTransform: 'none',
        color: active ? theme.palette.primary.main : theme.palette.text.primary,
        backgroundColor: active ? theme.palette.action.selected : 'transparent',
        '&:hover': {
            backgroundColor: active ? theme.palette.action.selected : theme.palette.action.hover,
        },
    }),

    // Icon container styles
    iconContainer: (open: boolean): CSSObject => ({
        minWidth: 'auto', // [FIX] Override default 56px
        minHeight: 'auto',
        marginRight: open ? 8 : 0, // 8px for button-like spacing
        justifyContent: 'center',
        position: 'relative', // For indicator positioning
        display: 'flex',
        alignItems: 'center',
    }),

    // Collapsed Dropdown Indicator
    collapsedIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        fontSize: 14,
        color: 'text.secondary',
        opacity: 0.7,
        pointerEvents: 'none',
    } as CSSObject,
};
