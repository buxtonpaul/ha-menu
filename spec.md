# Technical Specification: ha-menu

A lightweight, cross-platform, system-tray resident desktop application that connects to Home Assistant, displaying state updates in real-time and allowing instant control of entities (buttons, sliders, thermostats) from a polished native popover.

---

## 1. Architectural Shape

`ha-menu` is built as a single-context desktop utility using **Tauri v2**, combining a high-performance **Rust backend** with a responsive **TypeScript/HTML/CSS frontend** running in a lightweight native webview.

```
+-------------------------------------------------------+
|                       FRONTEND                        |
|   Vite + TypeScript + CSS (Tailwind/Vibrancy-ready)   |
+-------------------------------------------------------+
                           | IPC (Commands & Events)
+-------------------------------------------------------+
|                    TAURI V2 CORE                      |
|  - Window Positioning (tauri-plugin-positioner)       |
|  - OS-Level Vibrancy (window-vibrancy)                 |
+-------------------------------------------------------+
                           | Rust
+-------------------------------------------------------+
|                       BACKEND                         |
|  - YAML Configuration Loader (directories + serde)    |
|  - Live WebSocket Connection Client (tokio-tungstenite)|
+-------------------------------------------------------+
```

### Key Window Properties
* **Borderless (Decorations False):** The popover window is borderless to look like an OS-native widget.
* **Agent App (`LSUIElement`):** On macOS, the app runs as a background agent—meaning no Dock icon and no main application menu.
* **Skip Taskbar:** On Windows, the popover is hidden from the Taskbar and Alt+Tab switcher.
* **Always on Top:** Stays layered above other desktop windows when active.
* **Start Hidden:** Window is initialized as `visible: false` to prevent flickering on boot.

---

## 2. Configuration & Storage

User configuration is stored in a YAML file named `config.yaml` located in the operating system's standard application configuration directory (resolved cross-platform via the `directories` crate).

### Standard Paths
* **macOS:** `~/Library/Application Support/ha-menu/config.yaml`
* **Linux:** `~/.config/ha-menu/config.yaml`
* **Windows:** `%APPDATA%\ha-menu\config.yaml`

### Schema (`config.yaml`)
```yaml
ha_url: "http://homeassistant.local:8123"
ha_token: "YOUR_LONG_LIVED_ACCESS_TOKEN_HERE"
entities:
  - "light.living_room"
  - "light.kitchen"
  - "climate.living_room"
  - "automation.goodnight"
```

---

## 3. Home Assistant WebSocket Protocol

The Rust backend connects to the Home Assistant WebSocket API at `ws://<HOST>:<PORT>/api/websocket` (or `wss://` if SSL is enabled) to achieve real-time bi-directional synchronization.

### Sequence diagram

1. **TCP Connection Established.**
2. **Server Hello:** Server sends `{ "type": "auth_required" }`.
3. **Client Authentication:** Client responds with:
   ```json
   { "type": "auth", "access_token": "YOUR_TOKEN" }
   ```
4. **Server Verdict:** Server responds with `{ "type": "auth_ok" }`.
5. **Command Phase:**
   * **Fetch Initial States:** Client queries all available entities to populate the UI and index fuzzy search:
     ```json
     { "id": 1, "type": "get_states" }
     ```
   * **Real-time Event Subscription:** Client subscribes to the event bus for immediate state changes:
     ```json
     { "id": 2, "type": "subscribe_events", "event_type": "state_changed" }
     ```
   * **Send Command (Toggle):**
     ```json
     { "id": 3, "type": "call_service", "domain": "homeassistant", "service": "toggle", "target": { "entity_id": "light.living_room" } }
     ```
   * **Send Command (Slider Brightness):**
     ```json
     { "id": 4, "type": "call_service", "domain": "light", "service": "turn_on", "target": { "entity_id": "light.kitchen" }, "service_data": { "brightness": 128 } }
     ```

---

## 4. UI/UX & Interactions

The custom popover widget is restricted to a compact dimension of **`360x500px`** with a professional native look.

### Layout & Overflow Handling
* **Sticky Header:** The search input bar remains locked to the top.
* **Sticky Footer:** Connection status indicators and the Settings gear button remain locked to the bottom.
* **Scrollable List:** The main central grid of entities scrolls vertically when list overflow occurs, preventing clipped content.

### Unified Search & Inline Discovery
* The search input bar acts as both a local filter and a global search registry:
  * Typing immediately filters currently pinned entities.
  * Below currently pinned entities, an inline divider appears labeled *"Add Home Assistant Entity..."* displaying fuzzy-matched search results from the full Home Assistant state registry.
  * Clicking an unpinned search match immediately pins it, adds it to the user's active list, appends it to `config.yaml`, and starts receiving real-time updates.

### Continuous 150ms Throttled Sliders
* Sliders (e.g. brightness or volume) move continuously (1% increments):
  * **Visual State:** The local percentage text label updates instantly to maintain maximum tactile responsiveness.
  * **WebSocket Throttling:** Actual `call_service` messages are throttled to send at most once every **150ms** during an active drag, with a final definitive update sent upon mouse release. This prevents overloading the Home Assistant event queue.

### Hover Unpin Controls
* Hovering over any active entity row reveals a low-contrast delete icon (`✕`) on the far right. Clicking it instantly unpins the entity, triggers a smooth exit animation, and updates `config.yaml`.

### Native OS Vibrancy
* **macOS:** Applies native `HudWindow` frosted-glass backdrop blending over the user's desktop wallpaper.
* **Windows:** Applies native translucent Acrylic or Mica panels.
* **Linux:** Gracefully falls back to clean, solid dark/light panels.

---

## 5. Settle & Debouncing Workarounds

To deliver native-level feel and resolve focus-loss and click conflicts, the application implements lock-free atomic-timer filters:

### Focus Loss Settle (250ms)
When clicking the tray icon on macOS/Windows, releasing the mouse click causes the OS status bar to dismiss, briefly stealing focus and triggering a spurious `Focused(false)` event.
* **Workaround:** If a `Focused(false)` event is received within **`250ms`** of showing the window, it is ignored, allowing the popover to remain open upon mouse release.

### Toggle Click Deduplication (300ms)
Clicking the tray icon while the popover is already visible causes focus loss (hiding the window) followed by a tray click event (re-opening it immediately).
* **Workaround:** Tray click actions to show the window are ignored if they occur within **`300ms`** of the last hide action, ensuring click-to-dismiss behavior functions correctly without double-triggering.
