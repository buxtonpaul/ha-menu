# Developer Guide

This guide covers how to set up the development environment, build, and run **HA Menu** from source.

## System Requirements

To build HA Menu, you need the following installed on your machine:

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Rust](https://www.rust-lang.org/tools/install) (includes `cargo`)
- [Xcode Command Line Tools](https://developer.apple.com/xcode/resources/) (for macOS compilation)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/buxtonpaul/ha-menu.git
   cd ha-menu
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

## Running in Development Mode

To start the application in development mode with hot-reloading (for both the frontend and the Rust backend):

```bash
npm run tauri dev
```

## Building for Production

To build a production release of the application (e.g., the `.app` and `.dmg` files):

```bash
npm run tauri build
```

This will compile the frontend into the `dist/` folder and then compile the Rust backend. The final macOS `.dmg` and `.app` bundles will be located in:

`src-tauri/target/release/bundle/`

## Project Structure

- `src/` - The vanilla TypeScript/HTML/CSS frontend.
- `src-tauri/` - The Rust backend handling system integration, tray menu, and configuration storage.
- `docs/` - Project documentation and ADRs.
