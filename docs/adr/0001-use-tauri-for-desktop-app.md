# 1. Use Tauri v2 for cross-platform desktop app

We have decided to use Tauri v2 as the primary application framework, combining a Rust backend with a webview frontend. This allows us to easily build a polished custom popover window with complex UI controls (sliders, fuzzy-search, toggle buttons) that anchors directly to the system tray, while keeping the application core lightweight.

## Status
Accepted

## Considered Options
- **Pure Rust GUI (egui/Slint):** Smaller binary size and lower memory overhead, but significantly harder to style custom popovers and implement rich UI widgets.
- **Tauri v2 (Chosen):** Better window positioning plugins, faster UI development, and flexible custom styling using web standards.
