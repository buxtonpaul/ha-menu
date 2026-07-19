# HA Menu

A menu-bar application for macOS to control your Home Assistant instance. 

## Features

- Quick access to Home Assistant from your macOS menu bar.
- Read and toggle entities directly from your desktop.

## Installation

1. Download the latest `.dmg` from the [Releases page](https://github.com/buxtonpaul/ha-menu/releases).
2. Open the `.dmg` and drag **HA Menu** into your Applications folder.

### macOS Gatekeeper Workaround (Unidentified Developer)
Currently, HA Menu is not signed with an Apple Developer certificate. When you first open the app, macOS may warn you that it is from an "Unidentified Developer" or that the app is damaged. 

To open it:
1. Open your **Applications** folder in Finder.
2. **Right-click (or Control-click)** on the HA Menu app.
3. Select **Open** from the context menu.
4. In the dialog that appears, click **Open**. 

*(Alternatively, you can run `xattr -cr /Applications/HA\ Menu.app` in your terminal to clear the quarantine attribute).*

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
