import { SvgIcon, SvgIconProps } from '@mui/material';

export default function IncompleteCircleIcon(props: SvgIconProps) {
    return (
        <SvgIcon {...props}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10H12V2z" />
        </SvgIcon>
    );
}
