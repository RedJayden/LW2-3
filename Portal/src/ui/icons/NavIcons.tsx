import React from 'react';
import SvgIcon from '@mui/material/SvgIcon';
import LinkIcon from '@mui/icons-material/Link';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import NearMeIcon from '@mui/icons-material/NearMe';
import PanToolIcon from '@mui/icons-material/PanTool';
import Grid3x3Icon from '@mui/icons-material/Grid3x3'; // [NEW]
import AddIcon from '@mui/icons-material/Add'; // [NEW]
import SaveIcon from '@mui/icons-material/Save'; // [NEW]
import FileOpenIcon from '@mui/icons-material/FileOpen'; // [NEW]
import StopIcon from '@mui/icons-material/Stop'; // [NEW]
import PlayArrowIcon from '@mui/icons-material/PlayArrow'; // [NEW]
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'; // [NEW]
import PolylineIcon from '@mui/icons-material/Polyline'; // [NEW]
import LayersIcon from '@mui/icons-material/Layers'; // [NEW]
import CodeIcon from '@mui/icons-material/Code'; // [NEW]
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'; // [NEW]
import CropSquareIcon from '@mui/icons-material/CropSquare';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import BrushIcon from '@mui/icons-material/Brush';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import ImageIcon from '@mui/icons-material/Image';
import StraightenIcon from '@mui/icons-material/Straighten';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import TimelineIcon from '@mui/icons-material/Timeline';
import HandymanIcon from '@mui/icons-material/Handyman';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PhotoCameraFrontIcon from '@mui/icons-material/PhotoCameraFront';
import WbIncandescentIcon from '@mui/icons-material/WbIncandescent';
import FlareIcon from '@mui/icons-material/Flare';
import TonalityIcon from '@mui/icons-material/Tonality';
import LinkedCameraIcon from '@mui/icons-material/LinkedCamera';
import InfoIcon from '@mui/icons-material/Info';
import SpeedIcon from '@mui/icons-material/Speed';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import CategoryIcon from '@mui/icons-material/Category';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import TuneIcon from '@mui/icons-material/Tune';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { MeasureMode } from '../pages/Recipe/Canvas/useCanvasStore';
import { LoaderCircle } from 'lucide-react'; // [NEW]

// Custom Angle Icon
function AngleIcon(props: any) {
    return (
        <SvgIcon {...props}>
            <path d="M20 18H4L16 4" fill="none" stroke="currentColor" strokeWidth="2" />
        </SvgIcon>
    );
}

// Custom Arc Icon Wrapper for Lucide Compatibility
function ArcIcon(props: any) {
    const size = props.fontSize === 'small' ? 20 : 24;
    return <LoaderCircle size={size} {...props} />;
}

// Custom Dot Icon (Filled Circle)
function DotIcon(props: any) {
    return (
        <SvgIcon {...props}>
            {/* Center Circle (Filled) - Scaled to be visible in icon */}
            <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
        </SvgIcon>
    );
}

// Export all icons as a unified object or individual exports
export const NavIcons = {
    Select: NearMeIcon,
    Pan: PanToolIcon,
    Rect: CropSquareIcon,
    Dot: DotIcon, // [NEW]
    Circle: RadioButtonUncheckedIcon,
    Draw: CategoryIcon,
    Text: TextFieldsIcon,
    Image: ImageIcon,
    MeasureDistance: StraightenIcon,
    MeasureRect: CropSquareIcon,
    MeasureCircle: RadioButtonUncheckedIcon,
    MeasureWidth: SwapHorizIcon,
    MeasureHeight: SwapVertIcon,
    MeasureAngle: AngleIcon,
    MeasurePolyline: TimelineIcon,
    MeasureDefault: StraightenIcon,
    ScannerCamera: CameraAltIcon,
    ObjectCamera: PhotoCameraFrontIcon,
    Light: WbIncandescentIcon,
    Laser: FlareIcon,
    Scanner: HandymanIcon,
    Calibration: TonalityIcon,
    OffsetCalibration: LinkedCameraIcon,
    Info: InfoIcon,
    Speed: SpeedIcon,
    Motion: OpenWithIcon,
    Tune: TuneIcon,
    Focus: CenterFocusStrongIcon,
    Triangle: ChangeHistoryIcon,
    Arc: ArcIcon, // [FIX] Wrapped Lucide icon to support fontSize prop
    Line: HorizontalRuleIcon,
    Architecture: ArchitectureIcon,
    Grid: Grid3x3Icon,
    Cross: AddIcon,
    Save: SaveIcon,
    Load: FileOpenIcon,
    Stop: StopIcon,
    Play: PlayArrowIcon,
    Delete: DeleteSweepIcon,
    Polyline: PolylineIcon,
    Layers: LayersIcon,
    Code: CodeIcon,
    Dropdown: ArrowDropDownIcon
};

// Measure Icon Helper
export const getMeasureIcon = (mode: MeasureMode | 'none' = 'none') => {
    switch (mode) {
        case 'distance': return <NavIcons.MeasureDistance />;
        case 'rect': return <NavIcons.MeasureRect />;
        case 'circle': return <NavIcons.MeasureCircle />;
        case 'width': return <NavIcons.MeasureWidth />;
        case 'height': return <NavIcons.MeasureHeight />;
        case 'angle': return <NavIcons.MeasureAngle />;
        case 'polyline': return <NavIcons.MeasurePolyline />;
        default: return <NavIcons.MeasureDefault />;
    }
};


