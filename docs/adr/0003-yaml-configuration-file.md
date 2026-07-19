# 3. Use YAML for Configuration File in Standard Directories

We have decided to store user configuration in a YAML file named `config.yaml` located within the operating system's standard application configuration directory (resolved via the `directories` crate). 

Choosing YAML matches the standard format used across the Home Assistant ecosystem, making it highly familiar and editable for the user.

## Status
Accepted

## Considered Options
- **TOML:** Rust-native, but less aligned with the Home Assistant community's familiarity with YAML.
- **JSON:** Harder for users to read, edit, and comment on manually.
- **YAML (Chosen):** Highly readable and perfectly aligned with Home Assistant conventions.
