import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Interfaces for Home Assistant state management
interface EntityState {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    brightness?: number;
    unit_of_measurement?: string;
    [key: string]: any;
  };
}

type ConfigEntityJS = string | { entity_id: string; alias?: string };

interface AppConfig {
  ha_url: string;
  ha_token: string;
  ui_scale?: number;
  entities: ConfigEntityJS[];
}

interface PinnedEntity {
  entity_id: string;
  alias?: string;
}

// Global cached states
let allHaStates: EntityState[] = [];
let pinnedEntityIds: string[] = [];
let pinnedEntities: PinnedEntity[] = [];

// DOM Element cache
let entityListContainer: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let statusIndicator: HTMLElement | null = null;
let statusText: HTMLElement | null = null;

// Helper to determine entity emoji icon based on domain/type
function getEntityIcon(entityId: string): string {
  const domain = entityId.split(".")[0];
  switch (domain) {
    case "light": return "💡";
    case "switch": return "🔌";
    case "binary_sensor": return "🔔";
    case "sensor":
      if (entityId.includes("temp")) return "🌡️";
      if (entityId.includes("humidity")) return "💧";
      if (entityId.includes("battery")) return "🔋";
      return "📊";
    case "climate": return "🌡️";
    case "automation": return "⚡";
    case "scene": return "🎬";
    case "script": return "📜";
    default: return "📦";
  }
}

// Render a single entity row dynamically based on domain and features
function renderEntityRow(entity: EntityState, isPinned: boolean): string {
  const entityId = entity.entity_id;
  const domain = entityId.split(".")[0];
  
  // Check if this entity has a custom alias in our pinnedEntities config, otherwise fallback to friendly_name
  const pinnedMatch = pinnedEntities.find((p) => p.entity_id === entityId);
  const friendlyName = pinnedMatch?.alias || entity.attributes.friendly_name || entityId;
  const icon = getEntityIcon(entityId);
  const state = entity.state;

  // Build the basic entity metadata column (clickable region)
  const clickTargetHtml = `
    <div class="entity-info entity-click-target" data-entity-id="${entityId}" style="cursor: pointer; flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;">
      <span class="entity-icon" id="icon-${entityId}">${icon}</span>
      <div class="entity-meta" style="min-width: 0; flex: 1;">
        <span class="entity-name" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">${friendlyName}</span>
        <span class="entity-id" style="display: block; font-size: 0.72rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${entityId}</span>
      </div>
    </div>
  `;

  // Far-right action control (Hover unpin for pinned, Add button for unpinned)
  const actionButtonHtml = isPinned
    ? `<button class="unpin-btn" data-unpin-id="${entityId}" title="Unpin Entity">✕</button>`
    : `<button class="add-btn" data-add-id="${entityId}">+ Add</button>`;

  // 1. DIMMABLE LIGHT ROW (Light domain with a brightness attribute) - Fully Inline!
  if (domain === "light" && entity.attributes.brightness !== undefined) {
    const brightness = entity.attributes.brightness || 0;
    const percentage = Math.round((brightness / 255) * 100);
    const dimVal = state === "off" ? "Off" : `${percentage}%`;

    return `
      <div class="entity-row flex-column" data-row-id="${entityId}">
        ${clickTargetHtml}
        
        <!-- Inline Thin Slider -->
        <div class="inline-slider-container">
          <input type="range" class="range-slider slider-control inline-slider" data-entity-id="${entityId}" min="0" max="100" value="${percentage}" />
        </div>

        <div class="entity-control" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="state-label" id="label-dim-${entityId}" style="font-size: 0.8rem; min-width: 32px; text-align: right; color: var(--text-muted);">${dimVal}</span>
          <span class="status-dot ${state === "on" ? "active" : ""}" id="status-dot-${entityId}"></span>
          ${actionButtonHtml}
        </div>
      </div>
    `;
  }

  // 2. STANDARD TOGGLE ROW (Lights, Switches, Input Booleans) - Fully Clickable Area!
  if (domain === "light" || domain === "switch" || domain === "input_boolean") {
    return `
      <div class="entity-row" data-row-id="${entityId}">
        ${clickTargetHtml}
        <div class="entity-control" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="status-dot ${state === "on" ? "active" : ""}" id="status-dot-${entityId}"></span>
          ${actionButtonHtml}
        </div>
      </div>
    `;
  }

  // 3. CLIMATE THERMOSTAT ROW
  if (domain === "climate") {
    const parsedTemp = parseFloat(state);
    const displayTemp = isNaN(parsedTemp) ? "--" : parsedTemp.toFixed(1);
    return `
      <div class="entity-row" data-row-id="${entityId}">
        ${clickTargetHtml}
        <div class="entity-control thermostat-control" style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; padding-right: 4px;">
          <button class="icon-button temp-down-btn" data-entity-id="${entityId}" style="padding: 2px 6px; font-size: 0.8rem;">−</button>
          <span class="temp-display" id="label-temp-${entityId}" style="font-size: 0.85rem; min-width: 38px; text-align: center;">${displayTemp}°C</span>
          <button class="icon-button temp-up-btn" data-entity-id="${entityId}" style="padding: 2px 6px; font-size: 0.8rem;">+</button>
        </div>
        <div class="entity-control" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="status-dot ${state !== "off" ? "active" : ""}" id="status-dot-${entityId}"></span>
          ${actionButtonHtml}
        </div>
      </div>
    `;
  }

  // 4. ACTION TRIGGER ROW (Automations, Scenes, Scripts)
  if (domain === "automation" || domain === "scene" || domain === "script") {
    const btnLabel = domain === "automation" ? "Run" : "Activate";
    return `
      <div class="entity-row" data-row-id="${entityId}">
        ${clickTargetHtml}
        <div class="entity-control" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button class="action-button trigger-btn" data-entity-id="${entityId}" data-domain="${domain}" style="font-size: 0.75rem; padding: 3px 6px;">${btnLabel}</button>
          ${actionButtonHtml}
        </div>
      </div>
    `;
  }

  // 5. READ-ONLY SENSOR / BINARY SENSOR / DEFAULT ROW
  const unit = entity.attributes.unit_of_measurement || "";
  const sensorDisplay = `${state}${unit ? " " + unit : ""}`;
  return `
      <div class="entity-row" data-row-id="${entityId}">
        ${clickTargetHtml}
        <div class="entity-control" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="state-label" style="font-weight: 600; font-size: 0.85rem;">${sensorDisplay}</span>
          ${actionButtonHtml}
        </div>
      </div>
    `;
}

// Core function to render active lists dynamically
function renderPopoverDashboard() {
  if (!entityListContainer) return;

  const query = searchInput?.value.toLowerCase().trim() || "";

  // A. IF SEARCH IN QUERY MODE: Render matching pinned + matching unpinned (Discovery)
  if (query.length > 0) {
    const matchingPinned = allHaStates.filter((entity) => {
      const isPinned = pinnedEntityIds.includes(entity.entity_id);
      if (!isPinned) return false;

      const name = entity.attributes.friendly_name?.toLowerCase() || "";
      const id = entity.entity_id.toLowerCase();
      return name.includes(query) || id.includes(query);
    });

    const matchingUnpinned = allHaStates.filter((entity) => {
      const isPinned = pinnedEntityIds.includes(entity.entity_id);
      if (isPinned) return false;

      const name = entity.attributes.friendly_name?.toLowerCase() || "";
      const id = entity.entity_id.toLowerCase();
      return name.includes(query) || id.includes(query);
    });

    let html = "";

    // Render Pinned Matches
    if (matchingPinned.length > 0) {
      matchingPinned.forEach((entity) => {
        html += renderEntityRow(entity, true);
      });
    }

    // Render Discovery/Unpinned Matches
    if (matchingUnpinned.length > 0) {
      html += `<div class="search-divider">Add Entity to Menu</div>`;
      matchingUnpinned.slice(0, 15).forEach((entity) => {
        html += renderEntityRow(entity, false);
      });
    }

    if (matchingPinned.length === 0 && matchingUnpinned.length === 0) {
      html = `<div class="loading-placeholder"><span>No matching entities found.</span></div>`;
    }

    entityListContainer.innerHTML = html;
  } 
  // B. IF IDLE/NO SEARCH: Render exactly your pinned entities
  else {
    if (pinnedEntityIds.length === 0) {
      entityListContainer.innerHTML = `
        <div class="loading-placeholder" style="flex-direction: column; gap: 8px;">
          <span>No entities pinned.</span>
          <span style="font-size: 0.85rem; color: var(--text-muted);">Type in search to find and add devices!</span>
        </div>
      `;
      return;
    }

    // Sort states to match the exact order declared in pinnedEntityIds config array
    const sortedPinnedEntities = pinnedEntityIds
      .map((id) => allHaStates.find((state) => state.entity_id === id))
      .filter((entity): entity is EntityState => entity !== undefined);

    let html = "";
    sortedPinnedEntities.forEach((entity) => {
      html += renderEntityRow(entity, true);
    });

    entityListContainer.innerHTML = html;
  }

  // Hook up event listeners to all newly created DOM elements!
  bindDynamicEventListeners();
}

// Dynamic elements event listeners binder
function bindDynamicEventListeners() {
  if (!entityListContainer) return;
  console.log("Binding dynamic event listeners to DOM...");

  // 1. Click-to-Toggle (Single Click) and Rename (Double Click) on Name/Icon
  const clickTargets = entityListContainer.querySelectorAll(".entity-click-target");
  console.log(`Found ${clickTargets.length} clickable target elements.`);
  clickTargets.forEach((el) => {
    let clickTimeout: any = null;

    // Single Click -> Toggles Device
    el.addEventListener("click", (e) => {
      if (clickTimeout !== null) {
        // Double click detected! Cancel the pending single click action
        clearTimeout(clickTimeout);
        clickTimeout = null;
        return;
      }

      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        const target = (e.target as HTMLElement).closest(".entity-click-target");
        if (!target) return;

        const entityId = target.getAttribute("data-entity-id") || "";
        const domain = entityId.split(".")[0];

        // Toggling light/switch/input_boolean
        if (domain === "light" || domain === "switch" || domain === "input_boolean") {
          const dot = document.getElementById("status-dot-" + entityId);
          const currentlyOn = dot ? dot.classList.contains("active") : false;
          const service = currentlyOn ? "turn_off" : "turn_on";

          console.log(`[JS Event] Click toggled: ${entityId} -> ${service}`);

          invoke("call_ha_service", {
            domain,
            service,
            targetEntity: entityId,
            serviceData: null,
          }).then(() => {
            console.log(`[JS Bridge] Toggle succeeded for ${entityId}`);
          }).catch((err) => {
            console.error(`[JS Bridge Error] Toggle failed for ${entityId}:`, err);
          });
        }
        // Running automation/scene/script
        else if (domain === "automation" || domain === "scene" || domain === "script") {
          const service = domain === "automation" ? "trigger" : "turn_on";
          console.log(`[JS Event] Click triggered action: ${entityId} -> ${service}`);
          
          invoke("call_ha_service", {
            domain,
            service,
            targetEntity: entityId,
            serviceData: null,
          });
        }
      }, 220); // 220ms is the perfect sweet spot to differentiate single vs double click
    });

    // Double Click -> Transforms label into an inline input field! (Explorer/Finder style)
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();

      if (clickTimeout !== null) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }

      const target = (e.target as HTMLElement).closest(".entity-click-target");
      if (!target) return;

      const entityId = target.getAttribute("data-entity-id") || "";
      const entity = allHaStates.find((s) => s.entity_id === entityId);
      const currentPinned = pinnedEntities.find((p) => p.entity_id === entityId);
      const currentName = currentPinned?.alias || entity?.attributes.friendly_name || entityId;

      const nameSpan = target.querySelector(".entity-name") as HTMLElement;
      if (!nameSpan) return;

      // Inline renaming input field styling
      nameSpan.innerHTML = `
        <input type="text" class="rename-input" value="${currentName}" 
          style="background: rgba(var(--text-main), 0.05); border: 1px solid var(--accent-color); color: var(--text-main); font-size: 0.95rem; font-weight: 500; font-family: inherit; border-radius: 4px; padding: 1px 4px; width: 130px; outline: none; margin: -2px 0;" />
      `;

      const input = nameSpan.querySelector(".rename-input") as HTMLInputElement;
      if (!input) return;

      input.focus();
      input.select();

      // Prevent input click/double-click from triggering row toggle commands
      input.addEventListener("click", (evt) => {
        evt.stopPropagation();
      });
      input.addEventListener("dblclick", (evt) => {
        evt.stopPropagation();
      });

      let isFinished = false;

      const saveNewAlias = async (newVal: string) => {
        if (isFinished) return;
        isFinished = true;

        const trimmed = newVal.trim();

        // Update local state caches
        pinnedEntities = pinnedEntities.map((p) => {
          if (p.entity_id === entityId) {
            return { entity_id: entityId, alias: trimmed ? trimmed : undefined };
          }
          return p;
        });
        pinnedEntityIds = pinnedEntities.map((p) => p.entity_id);

        // Save updated configuration back to disk
        try {
          const config = await invoke<AppConfig>("load_config");
          config.entities = pinnedEntities.map((p) => p.alias ? { entity_id: p.entity_id, alias: p.alias } : p.entity_id);
          await invoke("save_config", { config });
        } catch (err) {
          console.error("Failed to save alias config:", err);
        }

        // Re-render popover immediately
        renderPopoverDashboard();
      };

      input.addEventListener("keydown", async (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          await saveNewAlias(input.value);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          isFinished = true;
          renderPopoverDashboard(); // Revert back by re-rendering
        }
      });

      input.addEventListener("blur", async () => {
        await saveNewAlias(input.value);
      });
    });
  });

  // 2. Brightness Range Sliders (Inline thin sliders)
  const sliders = entityListContainer.querySelectorAll(".slider-control");
  console.log(`Found ${sliders.length} sliders.`);
  sliders.forEach((el) => {
    // We send throttled commands during drag to avoid network spam (Throttle is implemented in front)
    let lastSend = 0;

    const handleSlide = (e: Event, isFinal: boolean) => {
      const target = e.target as HTMLInputElement;
      const entityId = target.getAttribute("data-entity-id") || "";
      const percentage = parseInt(target.value);
      const brightness = Math.round((percentage / 100) * 255);

      const label = document.getElementById(`label-dim-${entityId}`);
      if (label) {
        label.textContent = percentage === 0 ? "Off" : `${percentage}%`;
      }

      // Keep slider open dynamically by adding active-slider class to row during drag
      const row = target.closest(".entity-row");
      if (row) {
        if (!isFinal) {
          row.classList.add("active-slider");
        } else {
          // Remove after small delay for a smooth slide-back transition
          setTimeout(() => {
            row.classList.remove("active-slider");
          }, 200);
        }
      }

      const now = Date.now();
      if (isFinal || now - lastSend > 150) {
        lastSend = now;
        const service = percentage === 0 ? "turn_off" : "turn_on";
        const service_data = percentage === 0 ? null : { brightness };
        
        console.log(`[JS Event] Slider dragged: ${entityId} -> ${service} (${percentage}%)`);
        
        invoke("call_ha_service", {
          domain: "light",
          service,
          targetEntity: entityId,
          serviceData: service_data,
        }).then(() => {
          console.log(`[JS Bridge] call_ha_service slider succeeded for ${entityId}`);
        }).catch((err) => {
          console.error(`[JS Bridge Error] call_ha_service slider failed for ${entityId}:`, err);
        });
      }
    };

    el.addEventListener("input", (e) => handleSlide(e, false));
    el.addEventListener("change", (e) => handleSlide(e, true));
  });

  // 3. Thermostat controls
  const downBtns = entityListContainer.querySelectorAll(".temp-down-btn");
  downBtns.forEach((el) => {
    el.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".temp-down-btn");
      const entityId = target?.getAttribute("data-entity-id") || "";
      const textLabel = document.getElementById(`label-temp-${entityId}`);
      
      if (textLabel) {
        let temp = parseFloat(textLabel.textContent || "21.5") - 0.5;
        textLabel.textContent = `${temp.toFixed(1)}°C`;
        
        invoke("call_ha_service", {
          domain: "climate",
          service: "set_temperature",
          targetEntity: entityId,
          serviceData: { temperature: temp },
        });
      }
    });
  });

  const upBtns = entityListContainer.querySelectorAll(".temp-up-btn");
  upBtns.forEach((el) => {
    el.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".temp-up-btn");
      const entityId = target?.getAttribute("data-entity-id") || "";
      const textLabel = document.getElementById(`label-temp-${entityId}`);
      
      if (textLabel) {
        let temp = parseFloat(textLabel.textContent || "21.5") + 0.5;
        textLabel.textContent = `${temp.toFixed(1)}°C`;
        
        invoke("call_ha_service", {
          domain: "climate",
          service: "set_temperature",
          targetEntity: entityId,
          serviceData: { temperature: temp },
        });
      }
    });
  });

  // 4. Triggers (Automations/Scenes)
  const triggers = entityListContainer.querySelectorAll(".trigger-btn");
  triggers.forEach((el) => {
    el.addEventListener("click", (e) => {
      const target = e.target as HTMLButtonElement;
      const entityId = target.getAttribute("data-entity-id") || "";
      const domain = target.getAttribute("data-domain") || "";

      const originalText = target.textContent;
      target.textContent = "Running...";
      target.disabled = true;

      // Map automations/scenes to HA websocket triggers
      const service = domain === "automation" ? "trigger" : "turn_on";

      invoke("call_ha_service", {
        domain,
        service,
        targetEntity: entityId,
        serviceData: null,
      }).then(() => {
        target.textContent = "Success! ✅";
        setTimeout(() => {
          target.textContent = originalText;
          target.disabled = false;
        }, 1500);
      }).catch((e) => {
        console.error(e);
        target.textContent = "Error ❌";
        setTimeout(() => {
          target.textContent = originalText;
          target.disabled = false;
        }, 1500);
      });
    });
  });

  // 5. Unpin Entity (✕)
  const unpinBtns = entityListContainer.querySelectorAll(".unpin-btn");
  unpinBtns.forEach((el) => {
    el.addEventListener("click", async (e) => {
      const target = (e.target as HTMLElement).closest(".unpin-btn");
      const entityId = target?.getAttribute("data-unpin-id") || "";

      pinnedEntities = pinnedEntities.filter((e) => e.entity_id !== entityId);
      pinnedEntityIds = pinnedEntities.map((e) => e.entity_id);
      
      // Update config.yaml file
      try {
        const config = await invoke<AppConfig>("load_config");
        config.entities = pinnedEntities.map((p) => p.alias ? { entity_id: p.entity_id, alias: p.alias } : p.entity_id);
        await invoke("save_config", { config });
      } catch (err) {
        console.error("Failed to save config on unpin:", err);
      }

      renderPopoverDashboard();
    });
  });

  // 6. Add Entity (+)
  const addBtns = entityListContainer.querySelectorAll(".add-btn");
  addBtns.forEach((el) => {
    el.addEventListener("click", async (e) => {
      const target = (e.target as HTMLElement).closest(".add-btn");
      const entityId = target?.getAttribute("data-add-id") || "";

      if (entityId && !pinnedEntityIds.includes(entityId)) {
        pinnedEntities.push({ entity_id: entityId });
        pinnedEntityIds = pinnedEntities.map((e) => e.entity_id);
        
        // Update config.yaml file
        try {
          const config = await invoke<AppConfig>("load_config");
          config.entities = pinnedEntities.map((p) => p.alias ? { entity_id: p.entity_id, alias: p.alias } : p.entity_id);
          await invoke("save_config", { config });
        } catch (err) {
          console.error("Failed to save config on add:", err);
        }
      }

      // Reset search bar and return to idle dashboard
      if (searchInput) {
        searchInput.value = "";
      }
      renderPopoverDashboard();
    });
  });
}

// Update single element row state on websocket state_changed push (Event Listener callback)
function updateEntityState(entityId: string, updatedObj: EntityState) {
  // Update state in local global cache
  const idx = allHaStates.findIndex((e) => e.entity_id === entityId);
  if (idx !== -1) {
    allHaStates[idx] = updatedObj;
  } else {
    allHaStates.push(updatedObj);
  }

  // Update elements directly in the DOM to avoid complete list re-renders (preserves scroll positions and input focus!)
  const row = document.querySelector(`[data-row-id="${entityId}"]`);
  if (!row) return;

  const domain = entityId.split(".")[0];
  const state = updatedObj.state;

  // Update status dot active state
  const statusDot = document.getElementById(`status-dot-${entityId}`);
  if (statusDot) {
    if (domain === "climate") {
      if (state !== "off") {
        statusDot.classList.add("active");
      } else {
        statusDot.classList.remove("active");
      }
    } else {
      if (state === "on") {
        statusDot.classList.add("active");
      } else {
        statusDot.classList.remove("active");
      }
    }
  }

  // Update dimming lights
  if (domain === "light") {
    const brightness = updatedObj.attributes.brightness || 0;
    const percentage = Math.round((brightness / 255) * 100);
    const slider = row.querySelector(".slider-control") as HTMLInputElement;
    const dimLabel = document.getElementById(`label-dim-${entityId}`);

    if (slider) {
      slider.value = percentage.toString();
    }
    if (dimLabel) {
      dimLabel.textContent = state === "off" ? "Off" : `${percentage}%`;
    }
  }

  // Update Thermostats
  if (domain === "climate") {
    const tempLabel = document.getElementById(`label-temp-${entityId}`);
    if (tempLabel) {
      const parsedTemp = parseFloat(state);
      const displayTemp = isNaN(parsedTemp) ? "--" : parsedTemp.toFixed(1);
      tempLabel.textContent = `${displayTemp}°C`;
    }
  }

  // Update sensor labels
  const sensorLabel = row.querySelector(".state-label");
  if (sensorLabel && domain !== "light") {
    const unit = updatedObj.attributes.unit_of_measurement || "";
    sensorLabel.textContent = `${state}${unit ? " " + unit : ""}`;
  }
}

// Initial Loader of configuration and backend states
async function initializeDashboard() {
  entityListContainer = document.getElementById("entity-list");
  searchInput = document.getElementById("entity-search") as HTMLInputElement;

  if (!entityListContainer) return;

  try {
    // 1. Fetch pinned entity IDs from config.yaml
    const config = await invoke<AppConfig>("load_config");
    pinnedEntities = (config.entities || []).map((e) => {
      if (typeof e === "string") {
        return { entity_id: e };
      } else {
        return { entity_id: e.entity_id, alias: e.alias };
      }
    });
    pinnedEntityIds = pinnedEntities.map((e) => e.entity_id);

    // Apply global UI Scaling factor from configuration
    const scale = config.ui_scale || 1.0;
    document.documentElement.style.setProperty("--ui-scale", scale.toString());

    // 2. Fetch full list of states from Home Assistant cache
    allHaStates = await invoke<EntityState[]>("get_ha_states");

    // 3. Render
    renderPopoverDashboard();
  } catch (err) {
    console.error("Failed to initialize dashboard:", err);
    entityListContainer.innerHTML = `
      <div class="loading-placeholder">
        <span style="color: #ff3b30;">Failed to connect to backend.</span>
      </div>
    `;
  }
}

// Listen for connection states from Rust background task
async function subscribeConnectionEvents() {
  statusIndicator = document.querySelector(".status-indicator");
  statusText = document.querySelector(".connection-status span:nth-child(2)");

  try {
    await listen<boolean>("ha-connected", (event) => {
      const isConnected = event.payload;
      if (statusIndicator && statusText) {
        if (isConnected) {
          statusIndicator.className = "status-indicator online";
          statusText.textContent = "Home Assistant Connected";
          
          // Re-load states immediately as we just reconnected
          setTimeout(() => {
            initializeDashboard();
          }, 100);
        } else {
          statusIndicator.className = "status-indicator";
          statusIndicator.style.backgroundColor = "#ff9500"; // Orange (Offline/Connecting)
          statusIndicator.style.boxShadow = "0 0 4px #ff9500";
          statusText.textContent = "Connecting to Home Assistant...";
        }
      }
    });

    await listen<string>("ha-raw-message", (_event) => {
      // Just debug-print or use for special frames
    });

    await listen<{ entity_id: string; new_state: EntityState }>(
      "ha-state-changed",
      (event) => {
        const { entity_id, new_state } = event.payload;
        updateEntityState(entity_id, new_state);
      }
    );
  } catch (err) {
    console.error(err);
  }
}

// Settings Editor Overlay Logic (Ticket 05 & 09)
function initSettingsView() {
  const settingsBtn = document.getElementById("settings-btn");
  const backBtn = document.getElementById("settings-back-btn");
  const saveBtn = document.getElementById("settings-save-btn") as HTMLButtonElement;
  const overlay = document.getElementById("settings-overlay");

  const urlInput = document.getElementById("input-ha-url") as HTMLInputElement;
  const tokenInput = document.getElementById("input-ha-token") as HTMLTextAreaElement;
  const scaleInput = document.getElementById("input-ui-scale") as HTMLInputElement;
  const scaleLabel = document.getElementById("label-ui-scale-val");

  if (settingsBtn && backBtn && saveBtn && overlay && urlInput && tokenInput && scaleInput && scaleLabel) {
    // Open Settings View
    settingsBtn.addEventListener("click", async () => {
      overlay.classList.add("active");
      
      try {
        const config = await invoke<AppConfig>("load_config");
        urlInput.value = config.ha_url || "";
        tokenInput.value = config.ha_token || "";
        
        const scale = config.ui_scale || 1.0;
        scaleInput.value = scale.toString();
        scaleLabel.textContent = `${Math.round(scale * 100)}%`;
        document.documentElement.style.setProperty("--ui-scale", scale.toString());
      } catch (err) {
        console.error("Failed to load configuration:", err);
      }
    });

    // Close / Cancel Settings View
    backBtn.addEventListener("click", async () => {
      overlay.classList.remove("active");
      
      // Revert live preview scaling to the original saved scale configuration
      try {
        const config = await invoke<AppConfig>("load_config");
        const scale = config.ui_scale || 1.0;
        document.documentElement.style.setProperty("--ui-scale", scale.toString());
      } catch (err) {
        console.error("Failed to revert UI scale:", err);
      }
    });

    // Sizing Slider Real-time Live Preview
    scaleInput.addEventListener("input", () => {
      const scale = parseFloat(scaleInput.value);
      scaleLabel.textContent = `${Math.round(scale * 100)}%`;
      document.documentElement.style.setProperty("--ui-scale", scale.toString());
    });

    // Save Settings
    saveBtn.addEventListener("click", async () => {
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;

      const url = urlInput.value.trim();
      const token = tokenInput.value.trim();
      const scale = parseFloat(scaleInput.value);

      try {
        const currentConfig = await invoke<AppConfig>("load_config");
        
        const updatedConfig: AppConfig = {
          ha_url: url,
          ha_token: token,
          ui_scale: scale,
          entities: currentConfig.entities || []
        };

        await invoke("save_config", { config: updatedConfig });
        
        saveBtn.textContent = "Saved! ✅";
        
        setTimeout(() => {
          overlay.classList.remove("active");
          saveBtn.textContent = originalText;
          saveBtn.disabled = false;
        }, 1200);

      } catch (err) {
        console.error("Failed to save configuration:", err);
        saveBtn.textContent = "Error ❌";
        setTimeout(() => {
          saveBtn.textContent = originalText;
          saveBtn.disabled = false;
        }, 1500);
      }
    });
  }
}

// Main Setup on Dom Ready
window.addEventListener("DOMContentLoaded", () => {
  initializeDashboard();
  initSettingsView();
  subscribeConnectionEvents();

  // Search input change handler
  const search = document.getElementById("entity-search") as HTMLInputElement;
  search?.addEventListener("input", () => {
    renderPopoverDashboard();
  });

  // Graceful Quit App listener (Ticket 12)
  const quitBtn = document.getElementById("quit-btn");
  quitBtn?.addEventListener("click", async () => {
    try {
      await invoke("exit_app");
    } catch (err) {
      console.error("Failed to exit app via backend, forcing window close:", err);
      window.close();
    }
  });
});
