# Development Roadmap

This document tracks planned future features and architectural expansions for `ha-menu`. 
These are ideas that have been validated and accepted but are not yet scheduled for an immediate sprint.

## Planned Features

### 1. Live Menu Bar Sensor Badges
**Description:** Allow users to pin specific sensors (e.g., a temperature sensor, power meter, or current weather state) directly to the macOS/Linux menu bar, alongside the application icon.
**Use Case:** A user wants to monitor their home's living room temperature or total power consumption at a glance without having to click open the popover.
**Technical Considerations:**
- Tauri v2 supports setting the title of the system tray dynamically (`tray.set_title("21.5°C")`).
- We will need a UI mechanism in the popover to "Pin to Menu Bar" on sensor entities.
- The Rust WebSocket loop will need to push specific state updates directly to the tray manager.

### 2. Entity Grouping / Folders
**Description:** Introduce visual organization to the main entity list. Allow users to group entities into collapsible sections or "rooms".
**Use Case:** As users add more than 10-15 entities, the flat list becomes difficult to parse quickly. Grouping allows them to organize by physical location ("Living Room", "Office") or by function ("Lights", "Routines").
**Technical Considerations:**
- Update `config.yaml` schema to support nested objects or group definitions (e.g., mapping group names to lists of entity IDs).
- UI updates to support collapsible accordion headers.
- Drag-and-drop support in the UI would be ideal but complex; a simpler first step is a basic "Add to Group" context menu or settings editor.

---
*Note: To move an item from the roadmap into active development, create a new Issue and map out the specific technical implementation steps.*