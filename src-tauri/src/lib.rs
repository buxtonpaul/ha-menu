use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Manager, WindowEvent, Emitter,
};
use tauri_plugin_positioner::{WindowExt, Position};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use std::collections::HashMap;
use std::fs::{create_dir_all, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use directories::ProjectDirs;

use tokio_tungstenite::{
    connect_async,
    tungstenite::protocol::Message,
    MaybeTlsStream,
};
use futures_util::{StreamExt, SinkExt};
use std::time::Duration;
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use std::sync::Arc;

// --- CONFIGURATION STRUCTS ---
fn default_ui_scale() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum ConfigEntity {
    Simple(String),
    Detailed {
        entity_id: String,
        alias: Option<String>,
    },
}

impl ConfigEntity {
    pub fn entity_id(&self) -> &str {
        match self {
            ConfigEntity::Simple(id) => id,
            ConfigEntity::Detailed { entity_id, .. } => entity_id,
        }
    }

    pub fn alias(&self) -> Option<&str> {
        match self {
            ConfigEntity::Simple(_) => None,
            ConfigEntity::Detailed { alias, .. } => alias.as_deref(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub ha_url: String,
    pub ha_token: String,
    #[serde(default = "default_ui_scale")]
    pub ui_scale: f64,
    pub entities: Vec<ConfigEntity>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ha_url: "http://homeassistant.local:8123".to_string(),
            ha_token: "".to_string(),
            ui_scale: 1.0,
            entities: vec![
                ConfigEntity::Simple("light.living_room".to_string()),
                ConfigEntity::Simple("light.kitchen".to_string()),
                ConfigEntity::Simple("climate.living_room".to_string()),
                ConfigEntity::Simple("automation.goodnight".to_string()),
            ],
        }
    }
}

fn get_config_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        ProjectDirs::from("com", "ha-menu", "ha-menu")
            .map(|proj_dirs| proj_dirs.config_dir().join("config.yaml"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        // On macOS and Linux, standardize on XDG / dotfile-friendly paths!
        // 1. Check if $XDG_CONFIG_HOME is set
        if let Ok(val) = std::env::var("XDG_CONFIG_HOME") {
            if !val.is_empty() {
                return Some(PathBuf::from(val).join("ha-menu").join("config.yaml"));
            }
        }
        
        // 2. Fallback to standard user home dotfiles: ~/.config/ha-menu/config.yaml
        if let Ok(home) = std::env::var("HOME") {
            if !home.is_empty() {
                return Some(PathBuf::from(home).join(".config").join("ha-menu").join("config.yaml"));
            }
        }

        // 3. Absolute fallback
        ProjectDirs::from("com", "ha-menu", "ha-menu")
            .map(|proj_dirs| proj_dirs.config_dir().join("config.yaml"))
    }
}

#[tauri::command]
fn load_config() -> Result<AppConfig, String> {
    let path = get_config_path().ok_or("Could not resolve config directory")?;

    if !path.exists() {
        let default_config = AppConfig::default();
        let _ = save_config_raw(default_config.clone());
        return Ok(default_config);
    }

    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(|e| e.to_string())?;

    let config: AppConfig = serde_yaml::from_str(&contents).map_err(|e| e.to_string())?;
    Ok(config)
}

fn save_config_raw(config: AppConfig) -> Result<(), String> {
    let path = get_config_path().ok_or("Could not resolve config directory")?;
    if let Some(parent) = path.parent() {
        create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let yaml_str = serde_yaml::to_string(&config).map_err(|e| e.to_string())?;
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    file.write_all(yaml_str.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_config(
    connection_state: tauri::State<'_, HaConnectionState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config_raw(config)?;

    // Force background connection task to reconnect with new config instantly
    let tx = connection_state.tx.lock().unwrap();
    let tx_clone = tx.clone();
    tauri::async_runtime::spawn(async move {
        let _ = tx_clone.send("RECONNECT_FORCE".to_string()).await;
    });

    Ok(())
}

// --- MOCK/LIVE HOME ASSISTANT STATE ---
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EntityState {
    pub entity_id: String,
    pub state: String,
    pub attributes: serde_json::Value,
}

pub struct MockHaState {
    pub entities: Mutex<HashMap<String, EntityState>>,
}

impl MockHaState {
    fn new() -> Self {
        let mut map = HashMap::new();

        map.insert(
            "light.living_room".to_string(),
            EntityState {
                entity_id: "light.living_room".to_string(),
                state: "on".to_string(),
                attributes: serde_json::json!({
                    "friendly_name": "Living Room Light"
                }),
            },
        );

        map.insert(
            "light.kitchen".to_string(),
            EntityState {
                entity_id: "light.kitchen".to_string(),
                state: "on".to_string(),
                attributes: serde_json::json!({
                    "friendly_name": "Kitchen Lights",
                    "brightness": 191
                }),
            },
        );

        map.insert(
            "climate.living_room".to_string(),
            EntityState {
                entity_id: "climate.living_room".to_string(),
                state: "21.5".to_string(),
                attributes: serde_json::json!({
                    "friendly_name": "Thermostat"
                }),
            },
        );

        map.insert(
            "automation.goodnight".to_string(),
            EntityState {
                entity_id: "automation.goodnight".to_string(),
                state: "off".to_string(),
                attributes: serde_json::json!({
                    "friendly_name": "Goodnight Automation"
                }),
            },
        );

        Self {
            entities: Mutex::new(map),
        }
    }
}

#[tauri::command]
fn get_ha_states(state: tauri::State<'_, MockHaState>) -> Vec<EntityState> {
    let map = state.entities.lock().unwrap();
    map.values().cloned().collect()
}

// --- OUTGOING WEBSOCKET CHANNEL ---
pub struct HaConnectionState {
    pub tx: Mutex<tokio::sync::mpsc::Sender<String>>,
    pub is_connected: Arc<AtomicBool>,
}

#[tauri::command]
fn call_ha_service(
    connection_state: tauri::State<'_, HaConnectionState>,
    domain: String,
    service: String,
    target_entity: String,
    service_data: Option<serde_json::Value>,
) -> Result<(), String> {
    println!("[Rust] call_ha_service invoked! domain={}, service={}, target_entity={}, service_data={:?}", domain, service, target_entity, service_data);

    if !connection_state.is_connected.load(Ordering::Relaxed) {
        println!("[Rust] call_ha_service rejected: Home Assistant is disconnected.");
        return Err("Home Assistant is currently disconnected.".to_string());
    }

    let tx = connection_state.tx.lock().unwrap();

    let id = MSG_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    
    // Merge target_entity into service_data or create a default service_data map.
    // Putting entity_id in BOTH service_data and target ensures 100% compatibility with older/custom HA domains!
    let mut data = match service_data {
        Some(serde_json::Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    data.insert("entity_id".to_string(), serde_json::Value::String(target_entity.clone()));

    let payload = serde_json::json!({
        "id": id,
        "type": "call_service",
        "domain": domain,
        "service": service,
        "target": {
            "entity_id": target_entity
        },
        "service_data": data
    });

    let tx_clone = tx.clone();
    tauri::async_runtime::spawn(async move {
        let _ = tx_clone.send(payload.to_string()).await;
    });

    Ok(())
}

// --- ASYNC WEBSOCKET CLIENT CORE ---
type WsStream = tokio_tungstenite::WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;
type WsWrite = futures_util::stream::SplitSink<WsStream, Message>;
type WsRead = futures_util::stream::SplitStream<WsStream>;

async fn perform_auth_handshake(
    ws_write: &mut WsWrite,
    ws_read: &mut WsRead,
    token: &str,
) -> Result<(), String> {
    // 1. Receive auth_required
    if let Some(msg) = ws_read.next().await {
        let msg = msg.map_err(|e| e.to_string())?;
        let text = msg.to_text().map_err(|e| e.to_string())?;
        let parsed: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if parsed["type"] != "auth_required" {
            return Err("Expected auth_required".to_string());
        }
    } else {
        return Err("Connection closed before handshake".to_string());
    }

    // 2. Send auth
    let auth_payload = serde_json::json!({
        "type": "auth",
        "access_token": token
    });
    ws_write.send(Message::Text(auth_payload.to_string())).await.map_err(|e| e.to_string())?;

    // 3. Receive auth_ok
    if let Some(msg) = ws_read.next().await {
        let msg = msg.map_err(|e| e.to_string())?;
        let text = msg.to_text().map_err(|e| e.to_string())?;
        let parsed: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if parsed["type"] == "auth_ok" {
            Ok(())
        } else {
            Err(format!("Auth failed: {:?}", parsed))
        }
    } else {
        return Err("Connection closed during auth".to_string());
    }
}

async fn fetch_initial_states(
    ws_write: &mut WsWrite,
    ws_read: &mut WsRead,
    state: &MockHaState,
) -> Result<(), String> {
    let get_states_payload = serde_json::json!({
        "id": 1,
        "type": "get_states"
    });
    ws_write.send(Message::Text(get_states_payload.to_string())).await.map_err(|e| e.to_string())?;

    if let Some(msg) = ws_read.next().await {
        let msg = msg.map_err(|e| e.to_string())?;
        let text = msg.to_text().map_err(|e| e.to_string())?;
        let parsed: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if parsed["type"] == "result" && parsed["success"] == true {
            if let Some(result_array) = parsed["result"].as_array() {
                let mut entities = state.entities.lock().unwrap();
                for item in result_array {
                    if let Some(entity_id) = item.get("entity_id").and_then(|v| v.as_str()) {
                        let entity_state = EntityState {
                            entity_id: entity_id.to_string(),
                            state: item.get("state").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            attributes: item.get("attributes").cloned().unwrap_or(serde_json::json!({})),
                        };
                        entities.insert(entity_id.to_string(), entity_state);
                    }
                }
                println!("Loaded {} live entities from Home Assistant!", entities.len());
            }
            Ok(())
        } else {
            Err("get_states response failed".to_string())
        }
    } else {
        Err("Connection closed while fetching states".to_string())
    }
}

async fn subscribe_to_events(ws_write: &mut WsWrite) -> Result<(), String> {
    let subscribe_payload = serde_json::json!({
        "id": 2,
        "type": "subscribe_events",
        "event_type": "state_changed"
    });
    ws_write.send(Message::Text(subscribe_payload.to_string())).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn handle_incoming_ws_message(app: &tauri::AppHandle, text: &str) {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(text) {
        if parsed["type"] == "result" {
            let success = parsed["success"].as_bool().unwrap_or(false);
            let id = parsed["id"].as_u64().unwrap_or(0);
            if success {
                println!("WebSocket Message ID {} succeeded!", id);
            } else {
                eprintln!("WebSocket Message ID {} FAILED: {:?}", id, parsed["error"]);
            }
        } else if parsed["type"] == "event" {
            let event = &parsed["event"];
            if event["event_type"] == "state_changed" {
                let data = &event["data"];
                if let (Some(entity_id), Some(_new_state)) = (data["entity_id"].as_str(), data["new_state"].as_object()) {
                    let entity_state = EntityState {
                        entity_id: entity_id.to_string(),
                        state: data["new_state"]["state"].as_str().unwrap_or("").to_string(),
                        attributes: data["new_state"]["attributes"].clone(),
                    };

                    // Update global state cache
                    let mock_state = app.state::<MockHaState>();
                    {
                        let mut entities = mock_state.entities.lock().unwrap();
                        entities.insert(entity_id.to_string(), entity_state.clone());
                    }

                    // Propagate state_changed to the frontend
                    let payload = serde_json::json!({
                        "entity_id": entity_id.to_string(),
                        "new_state": entity_state
                    });
                    let _ = app.emit("ha-state-changed", payload);
                }
            }
        }
    }
}

pub fn start_ha_client(app: tauri::AppHandle, mut rx: tokio::sync::mpsc::Receiver<String>) {
    tauri::async_runtime::spawn(async move {
        let retry_delay = Duration::from_secs(5);

        loop {
            let config = match load_config() {
                Ok(cfg) => cfg,
                Err(e) => {
                    eprintln!("Failed to load config: {e}");
                    tokio::time::sleep(retry_delay).await;
                    continue;
                }
            };

            if config.ha_token.is_empty() || config.ha_url.is_empty() {
                eprintln!("Credentials are empty, configure them in settings...");
                tokio::time::sleep(retry_delay).await;
                continue;
            }

            // Normalize URL to remove trailing slash and map http/https to ws/wss protocols
            let mut base_url = config.ha_url.trim().trim_end_matches('/').to_string();
            base_url = base_url.replace("http://", "ws://").replace("https://", "wss://");
            
            // Fallback to prefix with ws:// if no protocol matches
            if !base_url.starts_with("ws://") && !base_url.starts_with("wss://") {
                base_url = format!("ws://{}", base_url);
            }

            let ws_url = format!("{}/api/websocket", base_url);
            println!("Connecting to Home Assistant at {}...", ws_url);

            let ws_stream = match connect_async(&ws_url).await {
                Ok((stream, _)) => stream,
                Err(e) => {
                    eprintln!("Connection failed: {e}");
                    tokio::time::sleep(retry_delay).await;
                    continue;
                }
            };

            let (mut ws_write, mut ws_read) = ws_stream.split();

            if let Err(e) = perform_auth_handshake(&mut ws_write, &mut ws_read, &config.ha_token).await {
                eprintln!("Handshake failed: {e}");
                tokio::time::sleep(retry_delay).await;
                continue;
            }

            println!("Home Assistant authenticated successfully!");

            let mock_state = app.state::<MockHaState>();
            if let Err(e) = fetch_initial_states(&mut ws_write, &mut ws_read, &mock_state).await {
                eprintln!("Failed to load initial states: {e}");
                tokio::time::sleep(retry_delay).await;
                continue;
            }

            if let Err(e) = subscribe_to_events(&mut ws_write).await {
                eprintln!("Failed to subscribe to state changed events: {e}");
                tokio::time::sleep(retry_delay).await;
                continue;
            }

            // Signal connected state to frontend
            let connection_state = app.state::<HaConnectionState>();
            connection_state.is_connected.store(true, Ordering::Relaxed);
            let _ = app.emit("ha-connected", true);

            // Active multiplexing loop with 30s keep-alive ping interval
            let mut ping_interval = tokio::time::interval(Duration::from_secs(30));
            // Reset immediate tick so the first ping fires after 30s, not immediately on launch
            ping_interval.reset();

            loop {
                tokio::select! {
                    msg = ws_read.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                handle_incoming_ws_message(&app, &text);
                                let _ = app.emit("ha-raw-message", text);
                            }
                            Some(Ok(Message::Close(_))) | None => {
                                println!("Connection closed by remote.");
                                break;
                            }
                            Some(Err(e)) => {
                                eprintln!("WebSocket error: {e}");
                                break;
                            }
                            _ => {}
                        }
                    }
                    outgoing = rx.recv() => {
                        if let Some(msg_text) = outgoing {
                            if msg_text == "RECONNECT_FORCE" {
                                println!("Reconnect forced.");
                                break;
                            }
                            if let Err(e) = ws_write.send(Message::Text(msg_text)).await {
                                eprintln!("Failed to write: {e}");
                                break;
                            }
                        }
                    }
                    _ = ping_interval.tick() => {
                        let id = MSG_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
                        let ping_payload = serde_json::json!({
                            "id": id,
                            "type": "ping"
                        });
                        if let Err(e) = ws_write.send(Message::Text(ping_payload.to_string())).await {
                            eprintln!("Failed to send ping heartbeat: {e}");
                            break;
                        }
                    }
                }
            }

            let connection_state = app.state::<HaConnectionState>();
            connection_state.is_connected.store(false, Ordering::Relaxed);
            let _ = app.emit("ha-connected", false);
            println!("Disconnected from Home Assistant. Retrying in 5 seconds...");
            tokio::time::sleep(retry_delay).await;
        }
    });
}

use std::time::{SystemTime, UNIX_EPOCH};

static LAST_SHOW_TIME: AtomicU64 = AtomicU64::new(0);
static LAST_HIDE_TIME: AtomicU64 = AtomicU64::new(0);
static MSG_ID_COUNTER: AtomicU64 = AtomicU64::new(3);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    println!("Exiting ha-menu gracefully...");
    app_handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(100);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MockHaState::new()) // inject mock HA state
        .manage(HaConnectionState {
            tx: Mutex::new(tx),
            is_connected: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }) // manage WS outgoing transmitter
        .setup(|app| {
            // Apply Vibrancy effects cross-platform
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    match apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::HudWindow,
                        None,
                        Some(12.0), // match corner radius
                    ) {
                        Ok(_) => println!("macOS Vibrancy applied successfully!"),
                        Err(err) => eprintln!("Failed to apply macOS vibrancy: {:?}", err),
                    }
                }
                #[cfg(target_os = "windows")]
                {
                    use window_vibrancy::apply_acrylic;
                    // Standard Windows Acrylic translucent effect
                    match apply_acrylic(&window, Some((0, 0, 0, 0))) {
                        Ok(_) => println!("Windows Acrylic applied successfully!"),
                        Err(err) => eprintln!("Failed to apply Windows acrylic: {:?}", err),
                    }
                }
            }

            // Start the background WebSocket client loop
            let app_handle = app.handle().clone();
            start_ha_client(app_handle, rx);

            #[cfg(desktop)]
            {
                // 1. Initialize the Positioner plugin
                app.handle().plugin(tauri_plugin_positioner::init())?;

                // 2. Build the System Tray Icon
                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .on_tray_icon_event(|tray_handle, event| {
                        // Update positioner with current tray location
                        tauri_plugin_positioner::on_tray_event(tray_handle.app_handle(), &event);

                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app_handle = tray_handle.app_handle();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);

                                if is_visible {
                                    LAST_HIDE_TIME.store(now_ms(), Ordering::Relaxed);
                                    let _ = window.hide();
                                    #[cfg(target_os = "macos")]
                                    {
                                        let _ = app_handle.hide();
                                    }
                                } else {
                                    // Toggle semantics: if the focus loss listener just closed the window,
                                    // skip re-showing it immediately.
                                    let last_hide = LAST_HIDE_TIME.load(Ordering::Relaxed);
                                    if last_hide != 0 && now_ms().saturating_sub(last_hide) < 300 {
                                        return;
                                    }

                                    #[cfg(target_os = "macos")]
                                    {
                                        let _ = app_handle.show();
                                    }

                                    // Move window directly below/above the tray icon
                                    let _ = window.as_ref().window().move_window(Position::TrayCenter);
                                    LAST_SHOW_TIME.store(now_ms(), Ordering::Relaxed);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;

                // 3. Register Auto-Hide on Focus Loss (Blur)
                if let Some(window) = app.get_webview_window("main") {
                    let w = window.clone();
                    let app_handle = app.handle().clone();
                    window.on_window_event(move |event| {
                        if let WindowEvent::Focused(false) = event {
                            // Ignore focus loss right after show (Windows compositor settle & macOS mouse up click release)
                            let last_show = LAST_SHOW_TIME.load(Ordering::Relaxed);
                            if last_show != 0 && now_ms().saturating_sub(last_show) < 250 {
                                return;
                            }

                            if w.is_visible().unwrap_or(false) {
                                LAST_HIDE_TIME.store(now_ms(), Ordering::Relaxed);
                                let _ = w.hide();
                                #[cfg(target_os = "macos")]
                                {
                                    let _ = app_handle.hide();
                                }
                            }
                        }
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            get_ha_states,
            call_ha_service,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
