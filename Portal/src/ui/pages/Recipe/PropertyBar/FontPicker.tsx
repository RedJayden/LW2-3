import React, { useState } from 'react';
import { Box, TextField, Typography, List, ListItem, ListItemButton, ListItemText, Divider, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';

// Bundled OpenType Web Fonts (copied to public/fonts)
const FONT_LIST = [
    { name: 'Arial', category: 'Sans Serif' },
    { name: 'Comic Sans MS', category: 'Handwriting' },
    { name: 'Courier New', category: 'Monospace' },
    { name: 'Georgia', category: 'Serif' },
    { name: 'Impact', category: 'Display' },
    { name: 'Nanum Gothic', category: 'Korean Sans Serif' },
    { name: 'Noto Sans KR', category: 'Korean Sans Serif' },
    { name: 'Tahoma', category: 'Sans Serif' },
    { name: 'Times New Roman', category: 'Serif' },
    { name: 'Trebuchet MS', category: 'Sans Serif' },
    { name: 'Verdana', category: 'Sans Serif' },
];

interface FontPickerProps {
    currentFont: string;
    onPreview: (font: string | null) => void;
    onSelect: (font: string) => void;
}

export default function FontPicker({ currentFont, onPreview, onSelect }: FontPickerProps) {
    const [search, setSearch] = useState('');

    const filteredFonts = FONT_LIST.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Box sx={{ width: 280, maxHeight: 400, display: 'flex', flexDirection: 'column' }}>
            {/* Search Header */}
            <Box sx={{ p: 2, borderBottom: '1px solid #333' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Select Font</Typography>
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Search fonts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" sx={{ color: '#888' }} />
                            </InputAdornment>
                        ),
                        sx: { fontSize: 13 }
                    }}
                />
            </Box>

            {/* Font List */}
            <List sx={{ flex: 1, overflowY: 'auto', p: 0 }}>
                {filteredFonts.map((font) => {
                    const isSelected = currentFont === font.name;
                    return (
                        <ListItem key={font.name} disablePadding>
                            <ListItemButton
                                onClick={() => onSelect(font.name)}
                                onMouseEnter={() => onPreview(font.name)}
                                onMouseLeave={() => onPreview(null)} // Revert to original on leave
                                sx={{
                                    py: 1.5,
                                    bgcolor: isSelected ? 'rgba(0, 190, 255, 0.1)' : 'transparent',
                                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' }
                                }}
                            >
                                <ListItemText
                                    primary={font.name}
                                    secondary={font.category}
                                    primaryTypographyProps={{
                                        style: { fontFamily: font.name, fontSize: '18px' }
                                    }}
                                    secondaryTypographyProps={{ sx: { fontSize: '10px', color: '#666' } }}
                                />
                                {isSelected && <CheckIcon fontSize="small" sx={{ color: '#00BEFF' }} />}
                            </ListItemButton>
                        </ListItem>
                    );
                })}
                {filteredFonts.length === 0 && (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">No fonts found</Typography>
                    </Box>
                )}
            </List>
        </Box>
    );
}
