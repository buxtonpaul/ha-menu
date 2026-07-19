# Context

A brief introduction to the domain of **ha-menu** (Home Assistant Menu).

## Purpose
`ha-menu` is a macOS/Linux menu bar application or widget interface that connects to Home Assistant, allowing users to control entities, trigger automations, and view state updates directly from their desktop.

## Glossary
- **Home Assistant**: The central smart home controller that hosts entities, services, and states.
- **Menu Bar Item**: An individual toggle or informational item displayed in the desktop menu bar.
- **Entity**: A Home Assistant device or virtual control (e.g., light, switch, automation).
- **Custom Window**: A borderless popover window that appears anchored to the system tray/menu bar icon, housing the interactive user interface (sliders, fuzzy-search, etc.).
- **Long-Lived Access Token**: A secure credential generated inside Home Assistant used to authenticate the `ha-menu` application.
- **WebSocket API**: The persistent, bi-directional connection protocol used to receive real-time state events from and send commands to Home Assistant.
- **Configuration File**: A YAML file stored in the platform's standard configuration directory containing Home Assistant connection details and the list of tracked entities.
- **Fuzzy Search**: A UI search bar in the Custom Window that queries the full list of Home Assistant entities to easily add new ones to the Configuration File.
