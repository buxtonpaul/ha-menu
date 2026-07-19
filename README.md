# HA Menu

A menu-bar application for macOS and Linux to control your Home Assistant instance. 

## Features

- Quick access to Home Assistant from your macOS menu bar.
- Read and toggle entities directly from your desktop.

## Installation

Download the latest version for your operating system from the [Releases page](https://github.com/buxtonpaul/ha-menu/releases).

### macOS
1. Download the `.dmg` file.
2. Open the `.dmg` and drag **HA Menu** into your Applications folder.

**Gatekeeper Workaround (Unidentified Developer)**  
Currently, HA Menu is not signed with an Apple Developer certificate. macOS may warn you that it is from an "Unidentified Developer" or that the app is damaged. 
To open it:
1. Open your **Applications** folder in Finder.
2. **Right-click (or Control-click)** on the HA Menu app.
3. Select **Open** from the context menu and click **Open** in the dialog. 
*(Alternatively, run `xattr -cr /Applications/HA\ Menu.app` in your terminal).*

### Linux
Two formats are provided for Linux:
- **`.deb` (Recommended for Debian/Ubuntu/Mint/Pop!_OS):** Install via `sudo apt install ./ha-menu*.deb`. This automatically installs the required system tray dependencies.
- **`.AppImage` (Universal Fallback):** Download, make executable (`chmod +x ha-menu*.AppImage`), and run.

**Important Note for GNOME Desktop Users (Ubuntu/Fedora):**  
GNOME does not natively support system tray icons. To see the HA Menu icon on a default GNOME desktop, you **must** install the [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/) GNOME extension.  
*(KDE Plasma, Linux Mint/Cinnamon, and XFCE support tray icons natively and require no extra setup).*

## Configuration

When you first launch the app, you will be prompted to configure it. You need two things:

1. **Home Assistant URL:** The URL you use to access your Home Assistant instance (e.g., `http://homeassistant.local:8123` or `https://ha.yourdomain.com`).
2. **Long-Lived Access Token (LLAT):** 
   - Go to your Home Assistant dashboard.
   - Click on your profile picture in the bottom left.
   - Scroll down to the **Security** tab.
   - Under **Long-Lived Access Tokens**, click **Create Token**.
   - Give it a name (e.g., "HA Menu") and copy the token provided.

## Developer Guide

If you'd like to build the app from source or contribute, please see the [Developer Guide](docs/developer-guide.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

This project was developed with the assistance of:
- **[Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent)**
- **Google Gemini** (Underlying LLM)
- **[Matt Pocock's Agent Skills](https://github.com/mattpocock/pi-skills)** (For engineering and architectural workflows)
