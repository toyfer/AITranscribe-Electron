# Assets Directory

This directory contains application assets including icons.

## Icons Required

For proper cross-platform builds, the following icon files are needed:

- `icon.ico` - Windows icon (256x256 recommended)
- `icon.png` - Linux icon (512x512 recommended) 
- `icon.icns` - macOS icon (512x512 recommended)

## Creating Icons

You can create these from a high-resolution PNG (1024x1024) using:

- Online converters like cloudconvert.com
- Tools like ImageMagick
- Electron-specific tools like `electron-icon-maker`

## Usage

The build system will automatically use these icons when creating distributables for each platform.