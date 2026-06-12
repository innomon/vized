/*
  VizEd — Visual Agent Editor & AI Architect Logic
  Client-side only, BYOK secure integration
*/

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('VizEd Service Worker Registered!', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// Default Configuration State
const defaultState = {
  root_agent: "RootAgent",
  openclaw: false,
  webui: false,
  a2a: false,
  console: false,
  models: {
    "gemini-flash": {
      provider: "gemini",
      model_id: "gemini-2.0-flash",
      default: true
    }
  },
  session: {
    provider: "",
    driver: "postgres",
    dsn: "",
    auto_migrate: false
  },
  memory: {
    provider: "",
    driver: "postgres",
    dsn: "",
    auto_migrate: false
  },
  auth: {
    jwt: {
      public_key_path: "",
      issuer: "",
      audience: ""
    }
  },
  tools: {
    "google_search": {
      type: "gemini",
      tool: "google_search",
      description: "Search the web using Google Search API"
    }
  },
  sandboxes: {},
  plugins: [],
  agents: {
    "RootAgent": {
      description: "General-purpose assistant that routes to specialized sub-agents",
      model: "gemini-flash",
      sub_agents: ["HelperAgent"],
      instruction: "You are a helpful assistant powered by the Agentic framework.\nYou can answer questions and help with various tasks.\n\nWhen the user needs detailed analysis or research, transfer to HelperAgent.\n",
      tools: ["google_search"]
    },
    "HelperAgent": {
      description: "Detailed analysis and research assistant",
      model: "gemini-flash",
      sub_agents: [],
      instruction: "You are a research and analysis assistant. Provide detailed, well-structured answers to complex questions. Use markdown formatting for clarity.\n",
      tools: []
    }
  }
};

// Global App state
let state = JSON.parse(JSON.stringify(defaultState));
let activeProfile = "default";
let profiles = ["default"];
let chatHistory = [];
let bypassValidationUpdate = false;

// DOM Elements
const yamlTextarea = document.getElementById('yaml-textarea');
const globalRootAgent = document.getElementById('global-root-agent');
const sessionProvider = document.getElementById('session-provider');
const sessionDsnGroup = document.getElementById('session-dsn-group');
const sessionDriver = document.getElementById('session-driver');
const sessionDsn = document.getElementById('session-dsn');
const sessionMigrate = document.getElementById('session-migrate');
const memoryProvider = document.getElementById('memory-provider');
const memoryDsnGroup = document.getElementById('memory-dsn-group');
const memoryDriver = document.getElementById('memory-driver');
const memoryDsn = document.getElementById('memory-dsn');
const memoryMigrate = document.getElementById('memory-migrate');

const modelsList = document.getElementById('models-list');
const toolsList = document.getElementById('tools-list');
const agentsList = document.getElementById('agents-list');
const projectList = document.getElementById('project-list');
const topologyGraph = document.getElementById('topology-graph');
const validationPill = document.getElementById('validation-pill');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatForm = document.getElementById('chat-form');
const chatSidebar = document.getElementById('chat-sidebar');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const btnClearChat = document.getElementById('btn-clear-chat');

// Modals
const keyModal = document.getElementById('key-modal');
const modelModal = document.getElementById('model-modal');
const toolModal = document.getElementById('tool-modal');
const importModal = document.getElementById('import-modal');
const projectModal = document.getElementById('project-modal');

// API Settings (BYOK Multi-provider)
let apiProvider = localStorage.getItem('vized_api_provider') || 'gemini';
let apiBaseUrl = localStorage.getItem('vized_api_base_url') || '';
let apiKey = localStorage.getItem('vized_api_key') || localStorage.getItem('vized_gemini_key') || '';
let apiModel = localStorage.getItem('vized_api_model') || 'gemini-2.5-flash';
let apiCustomModel = localStorage.getItem('vized_api_custom_model') || '';
let geminiApiKey = apiKey; // Backward compatibility fallback

// DOM Elements for BYOK Settings
let apiProviderSelect, apiBaseUrlGroup, apiBaseUrlInput, apiKeyGroup, apiKeyInput, apiModelSelect, apiCustomModelGroup, apiCustomModelInput;

// App Initializations
document.addEventListener('DOMContentLoaded', () => {
  loadProfilesFromStorage();
  loadStateFromProfile(activeProfile);
  loadChatHistory();
  bindUIEvents();
  syncYAMLFromVisuals();
  
  // Set up marked configuration
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }
});

// Toast Notifications Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '';
  if (type === 'success') {
    icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ----------------------------------------------------
// STATE PERSISTENCE & DUAL SYNC
// ----------------------------------------------------

function loadProfilesFromStorage() {
  const storedProfiles = localStorage.getItem('vized_profiles');
  if (storedProfiles) {
    profiles = JSON.parse(storedProfiles);
  }
  const storedActive = localStorage.getItem('vized_active_profile');
  if (storedActive && profiles.includes(storedActive)) {
    activeProfile = storedActive;
  }
  renderProjectList();
}

function loadStateFromProfile(name) {
  const storedData = localStorage.getItem(`vized_state_${name}`);
  if (storedData) {
    try {
      state = JSON.parse(storedData);
      showToast(`Loaded configuration profile: ${name}`, 'success');
    } catch (e) {
      state = JSON.parse(JSON.stringify(defaultState));
    }
  } else {
    state = JSON.parse(JSON.stringify(defaultState));
  }
  activeProfile = name;
  localStorage.setItem('vized_active_profile', name);
  renderVisualEditor();
  renderProjectList();
  renderTopology();
}

function saveStateToProfile(name) {
  if (!profiles.includes(name)) {
    profiles.push(name);
    localStorage.setItem('vized_profiles', JSON.stringify(profiles));
  }
  localStorage.setItem(`vized_state_${name}`, JSON.stringify(state));
  renderProjectList();
  showToast(`Saved configuration profile: ${name}`, 'success');
}

function syncYAMLFromVisuals() {
  if (bypassValidationUpdate) return;
  try {
    // Generate clean output object matching framework schema
    const out = {};
    if (state.root_agent) out.root_agent = state.root_agent;
    if (state.console) out.console = true;
    if (state.webui) out.webui = true;
    if (state.openclaw) out.openclaw = true;
    if (state.a2a) out.a2a = true;
    
    if (state.models && Object.keys(state.models).length > 0) {
      out.models = state.models;
    }
    
    if (state.session && state.session.provider) {
      out.session = {
        provider: state.session.provider
      };
      if (state.session.provider === 'database') {
        out.session.driver = state.session.driver || 'postgres';
        out.session.dsn = state.session.dsn || '';
        out.session.auto_migrate = !!state.session.auto_migrate;
      }
    }
    
    if (state.memory && state.memory.provider) {
      out.memory = {
        provider: state.memory.provider
      };
      if (state.memory.provider === 'database') {
        out.memory.driver = state.memory.driver || 'postgres';
        out.memory.dsn = state.memory.dsn || '';
        out.memory.auto_migrate = !!state.memory.auto_migrate;
      } else if (state.memory.provider === 'prolog') {
        out.memory.kb_path = state.memory.kb_path || './memory.pl';
      }
    }
    
    if (state.auth && state.auth.jwt && state.auth.jwt.public_key_path) {
      out.auth = { jwt: state.auth.jwt };
    }
    
    if (state.tools && Object.keys(state.tools).length > 0) {
      out.tools = state.tools;
    }

    if (state.sandboxes && Object.keys(state.sandboxes).length > 0) {
      out.sandboxes = state.sandboxes;
    }

    if (state.plugins && state.plugins.length > 0) {
      out.plugins = state.plugins;
    }
    
    if (state.agents && Object.keys(state.agents).length > 0) {
      out.agents = {};
      Object.entries(state.agents).forEach(([name, agentCfg]) => {
        const copy = JSON.parse(JSON.stringify(agentCfg));
        if (copy.type === 'workflow') {
          delete copy.sub_agents;
        }
        out.agents[name] = copy;
      });
    }
    
    const yamlText = jsyaml.dump(out, { indent: 2, lineWidth: -1, noRefs: true });
    yamlTextarea.value = yamlText;
    
    validationPill.textContent = "Config Valid";
    validationPill.style.background = "rgba(16,185,129,0.15)";
    validationPill.style.borderColor = "rgba(16,185,129,0.3)";
    validationPill.style.color = "var(--accent-green)";
  } catch (err) {
    console.error("YAML Generation Error:", err);
  }
}

function syncVisualsFromYAML(yamlText) {
  try {
    const parsed = jsyaml.load(yamlText);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error("Invalid configuration structure.");
    }
    
    // Normalize and inject parsed parameters into working state
    const newState = {
      root_agent: parsed.root_agent || "RootAgent",
      console: !!parsed.console,
      webui: !!parsed.webui,
      openclaw: !!parsed.openclaw,
      a2a: !!parsed.a2a,
      models: parsed.models || {},
      session: parsed.session || { provider: "" },
      memory: parsed.memory || { provider: "" },
      auth: parsed.auth || { jwt: { public_key_path: "", issuer: "", audience: "" } },
      tools: parsed.tools || {},
      sandboxes: parsed.sandboxes || {},
      plugins: parsed.plugins || [],
      agents: parsed.agents || {}
    };

    // Calculate sub_agents for workflows internally so topology works
    Object.values(newState.agents).forEach(agent => {
      if (agent.type === 'workflow') {
        const subs = new Set();
        if (agent.nodes) {
          agent.nodes.forEach(n => {
            if (n.agent) subs.add(n.agent);
          });
        }
        agent.sub_agents = Array.from(subs);
      }
    });
    
    state = newState;
    
    validationPill.textContent = "Config Valid";
    validationPill.style.background = "rgba(16,185,129,0.15)";
    validationPill.style.borderColor = "rgba(16,185,129,0.3)";
    validationPill.style.color = "var(--accent-green)";
    
    bypassValidationUpdate = true;
    renderVisualEditor();
    renderTopology();
    bypassValidationUpdate = false;
    
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
  } catch (err) {
    validationPill.textContent = "Parsing Error";
    validationPill.style.background = "rgba(239,68,68,0.15)";
    validationPill.style.borderColor = "rgba(239,68,68,0.3)";
    validationPill.style.color = "var(--accent-red)";
  }
}

// ----------------------------------------------------
// DYNAMIC UI RENDERERS
// ----------------------------------------------------

function renderVisualEditor() {
  // Globals
  renderRootAgentSelector();
  
  sessionProvider.value = state.session.provider || "";
  if (state.session.provider === 'database') {
    sessionDsnGroup.classList.remove('hidden');
    sessionDriver.value = state.session.driver || "postgres";
    sessionDsn.value = state.session.dsn || "";
    sessionMigrate.checked = !!state.session.auto_migrate;
  } else {
    sessionDsnGroup.classList.add('hidden');
  }
  
  memoryProvider.value = state.memory.provider || "";
  if (state.memory.provider === 'database') {
    memoryDsnGroup.classList.remove('hidden');
    memoryDriver.value = state.memory.driver || "postgres";
    memoryDsn.value = state.memory.dsn || "";
    memoryMigrate.checked = !!state.memory.auto_migrate;
  } else {
    memoryDsnGroup.classList.add('hidden');
  }
  
  // Launcher Flags
  document.getElementById('flag-console').checked = !!state.console;
  document.getElementById('flag-webui').checked = !!state.webui;
  document.getElementById('flag-openclaw').checked = !!state.openclaw;
  document.getElementById('flag-a2a').checked = !!state.a2a;
  
  document.getElementById('flag-console-chip').classList.toggle('selected', !!state.console);
  document.getElementById('flag-webui-chip').classList.toggle('selected', !!state.webui);
  document.getElementById('flag-openclaw-chip').classList.toggle('selected', !!state.openclaw);
  document.getElementById('flag-a2a-chip').classList.toggle('selected', !!state.a2a);
  
  // Model Cards
  renderModelCards();
  
  // Tool Cards
  renderToolCards();
  
  // Agent Cards
  renderAgentCards();
  
  // Sandbox Cards
  renderSandboxCards();
  
  // Plugin Cards
  renderPluginCards();
}

function renderRootAgentSelector() {
  globalRootAgent.innerHTML = "";
  const agentNames = Object.keys(state.agents);
  
  if (agentNames.length === 0) {
    const opt = document.createElement('option');
    opt.value = "";
    opt.textContent = "No Agents Available";
    globalRootAgent.appendChild(opt);
    return;
  }
  
  agentNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (state.root_agent === name) {
      opt.selected = true;
    }
    globalRootAgent.appendChild(opt);
  });
}

function renderModelCards() {
  modelsList.innerHTML = "";
  Object.entries(state.models).forEach(([name, cfg]) => {
    const card = document.createElement('div');
    card.className = `item-card`;
    card.innerHTML = `
      <div class="item-card-header">
        <span class="item-card-title">${name}</span>
        <span class="item-card-badge">${cfg.provider.toUpperCase()}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
        <div><strong>Model ID:</strong> ${cfg.model_id}</div>
        ${cfg.default ? `<div style="color:var(--accent-cyan); font-weight:700;">★ Default Model</div>` : ''}
        ${cfg.base_url ? `<div><strong>URL:</strong> ${cfg.base_url}</div>` : ''}
      </div>
      <div class="item-card-actions">
        <button class="btn btn-danger btn-sm delete-model-btn" data-name="${name}">Remove</button>
      </div>
    `;
    modelsList.appendChild(card);
  });
  
  // Delete action listener
  document.querySelectorAll('.delete-model-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-name');
      delete state.models[name];
      saveStateToProfile(activeProfile);
      renderVisualEditor();
      syncYAMLFromVisuals();
      renderTopology();
    });
  });
}

function renderToolCards() {
  toolsList.innerHTML = "";
  Object.entries(state.tools).forEach(([name, cfg]) => {
    const card = document.createElement('div');
    card.className = `item-card`;
    card.innerHTML = `
      <div class="item-card-header">
        <span class="item-card-title">${name}</span>
        <span class="item-card-badge">${cfg.type.toUpperCase()}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
        <div style="font-style: italic; line-height: 1.4; margin-bottom: 4px;">${cfg.description || 'No description provided.'}</div>
        ${cfg.tool ? `<div><strong>Builtin:</strong> ${cfg.tool}</div>` : ''}
        ${cfg.module_path ? `<div><strong>Wasm Module:</strong> ${cfg.module_path}</div>` : ''}
        ${cfg.kb_path ? `<div><strong>Prolog KB:</strong> ${cfg.kb_path}</div>` : ''}
        ${cfg.sandbox ? `<div><strong>Sandbox:</strong> ${cfg.sandbox}</div>` : ''}
        ${cfg.op ? `<div><strong>UserDB Op:</strong> ${cfg.op}</div>` : ''}
        ${cfg.db && cfg.db.driver ? `<div><strong>DB:</strong> ${cfg.db.driver} (${cfg.db.dsn ? 'configured' : 'no DSN'})</div>` : ''}
        ${cfg.admin_users && cfg.admin_users.length > 0 ? `<div><strong>Admins:</strong> ${cfg.admin_users.join(', ')}</div>` : ''}
      </div>
      <div class="item-card-actions">
        <button class="btn btn-danger btn-sm delete-tool-btn" data-name="${name}">Remove</button>
      </div>
    `;
    toolsList.appendChild(card);
  });
  
  document.querySelectorAll('.delete-tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-name');
      // Remove references in agents
      Object.values(state.agents).forEach(agent => {
        if (agent.tools) {
          agent.tools = agent.tools.filter(t => t !== name);
        }
      });
      delete state.tools[name];
      saveStateToProfile(activeProfile);
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });
}

function renderSandboxCards() {
  const sandboxesList = document.getElementById('sandboxes-list');
  if (!sandboxesList) return;
  sandboxesList.innerHTML = "";
  
  Object.entries(state.sandboxes || {}).forEach(([name, cfg]) => {
    const card = document.createElement('div');
    card.className = `item-card`;
    card.innerHTML = `
      <div class="item-card-header">
        <span class="item-card-title">${name}</span>
        <span class="item-card-badge">${(cfg.type || 'quickjs').toUpperCase()}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
        <div><strong>Timeout:</strong> ${cfg.timeout || '5s'}</div>
        <div><strong>Memory:</strong> ${cfg.memory_limit_mb || 128} MB</div>
        ${cfg.allow_net && cfg.allow_net.length > 0 ? `<div><strong>Net:</strong> ${cfg.allow_net.join(', ')}</div>` : ''}
        ${cfg.allow_tools && cfg.allow_tools.length > 0 ? `<div><strong>Tools:</strong> ${cfg.allow_tools.join(', ')}</div>` : ''}
        ${cfg.env && Object.keys(cfg.env).length > 0 ? `<div><strong>Env:</strong> ${Object.keys(cfg.env).length} variables</div>` : ''}
      </div>
      <div class="item-card-actions">
        <button class="btn btn-danger btn-sm delete-sandbox-btn" data-name="${name}">Remove</button>
      </div>
    `;
    sandboxesList.appendChild(card);
  });
  
  document.querySelectorAll('.delete-sandbox-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-name');
      delete state.sandboxes[name];
      
      // Update tools referencing this sandbox
      Object.values(state.tools).forEach(tool => {
        if (tool.type === 'sandbox' && tool.sandbox === name) {
          tool.sandbox = "";
        }
      });
      
      saveStateToProfile(activeProfile);
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });
}

function renderPluginCards() {
  const pluginsList = document.getElementById('plugins-list');
  if (!pluginsList) return;
  pluginsList.innerHTML = "";
  
  (state.plugins || []).forEach((plugin, idx) => {
    const card = document.createElement('div');
    card.className = `item-card`;
    card.innerHTML = `
      <div class="item-card-header">
        <span class="item-card-title">${plugin.name || 'unnamed'}</span>
        <span class="item-card-badge">${(plugin.type || 'logging').toUpperCase()}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
        ${plugin.type === 'retry_and_reflect' ? `
          <div><strong>Max Retries:</strong> ${plugin.max_retries || 3}</div>
          <div><strong>Scope:</strong> ${plugin.scope || 'invocation'}</div>
          <div><strong>Error if exceeded:</strong> ${!!plugin.error_if_retry_exceeded}</div>
        ` : ''}
        ${plugin.type === 'wasm' ? `
          <div><strong>Module Path:</strong> ${plugin.module_path || ''}</div>
          ${plugin.config && Object.keys(plugin.config).length > 0 ? `<div><strong>Config:</strong> ${Object.keys(plugin.config).length} params</div>` : ''}
        ` : ''}
      </div>
      <div class="item-card-actions">
        <button class="btn btn-danger btn-sm delete-plugin-btn" data-idx="${idx}">Remove</button>
      </div>
    `;
    pluginsList.appendChild(card);
  });
  
  document.querySelectorAll('.delete-plugin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'));
      state.plugins.splice(idx, 1);
      saveStateToProfile(activeProfile);
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });
}

function renderAgentCards() {
  agentsList.innerHTML = "";
  
  Object.entries(state.agents).forEach(([name, cfg]) => {
    const card = document.createElement('div');
    card.className = "section-card";
    card.style.background = "rgba(20, 27, 45, 0.4)";
    
    const aType = cfg.type || "llm";
    
    // Build select model options
    let modelOpts = "";
    Object.keys(state.models).forEach(mName => {
      modelOpts += `<option value="${mName}" ${cfg.model === mName ? 'selected' : ''}>${mName}</option>`;
    });
    
    // Tools checklist
    let toolsChecklist = "";
    Object.keys(state.tools).forEach(tName => {
      const isChecked = cfg.tools && cfg.tools.includes(tName);
      toolsChecklist += `
        <div class="selector-chip ${isChecked ? 'selected' : ''}" data-agent="${name}" data-tool="${tName}">
          <input type="checkbox" style="display:none;" ${isChecked ? 'checked' : ''}>
          ${tName}
        </div>
      `;
    });
    
    // Sub-agents checklist (exclude self)
    let subAgentsChecklist = "";
    Object.keys(state.agents).forEach(aName => {
      if (aName === name) return;
      const isChecked = cfg.sub_agents && cfg.sub_agents.includes(aName);
      subAgentsChecklist += `
        <div class="selector-chip ${isChecked ? 'selected' : ''}" data-agent="${name}" data-subagent="${aName}">
          <input type="checkbox" style="display:none;" ${isChecked ? 'checked' : ''}>
          ${aName}
        </div>
      `;
    });
    
    // Render MCP Toolsets if LLM / Routing
    let mcpHTML = "";
    if (aType === 'llm' || aType === 'routing') {
      const mcpList = cfg.mcp_toolsets || [];
      const mcpRows = mcpList.map((mcp, idx) => `
        <div class="mcp-row flex-row" style="margin-bottom:6px;" data-agent="${name}" data-idx="${idx}">
          <input type="text" class="form-input mcp-endpoint-input" style="flex:1;" value="${mcp.endpoint || ''}" placeholder="e.g. \${MCP_SERVER_URL:-http://localhost:8082}/mcp">
          <button class="btn btn-danger btn-sm btn-remove-mcp">✕</button>
        </div>
      `).join('');
      
      mcpHTML = `
        <div class="form-group full-width" style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="form-label">MCP Toolsets (External Servers)</label>
            <button class="btn btn-add-mcp" data-agent="${name}" style="padding:4px 8px; font-size:11px;">+ Add MCP Toolset</button>
          </div>
          <div class="mcp-container">${mcpRows || '<div style="font-size:12px; color:var(--text-muted);">No MCP endpoints configured.</div>'}</div>
        </div>
      `;
    }
    
    // Render Routing Rules if Routing Type
    let routingHTML = "";
    if (aType === 'routing') {
      const routesList = Object.entries(cfg.role_routes || {});
      const routesRows = routesList.map(([role, target], idx) => {
        let routeOpts = `<option value="">Select Target...</option>`;
        Object.keys(state.agents).forEach(aName => {
          if (aName === name) return;
          routeOpts += `<option value="${aName}" ${target === aName ? 'selected' : ''}>${aName}</option>`;
        });
        return `
          <div class="route-rule-row flex-row" style="margin-bottom:6px;" data-agent="${name}" data-idx="${idx}">
            <input type="text" class="form-input route-key-input" style="flex:1;" value="${role}" placeholder="e.g. admin, seller, anonymous">
            <select class="form-select route-val-select" style="flex:1;">
               ${routeOpts}
            </select>
            <button class="btn btn-danger btn-sm btn-remove-route">✕</button>
          </div>
        `;
      }).join('');
      
      routingHTML = `
        <div class="form-group full-width" style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:8px;">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Admin User Logins (Comma-separated)</label>
              <input type="text" class="form-input route-admins-input" data-agent="${name}" value="${(cfg.admin_users || []).join(', ')}" placeholder="e.g. admin1, admin2">
            </div>
            <div class="form-group full-width">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label class="form-label">Role Routing Routes</label>
                <button class="btn btn-add-route-rule" data-agent="${name}" style="padding:4px 8px; font-size:11px;">+ Add Routing Rule</button>
              </div>
              <div class="routes-container">${routesRows || '<div style="font-size:12px; color:var(--text-muted);">No role routing rules configured.</div>'}</div>
            </div>
          </div>
        </div>
      `;
    }
    
    // Render loop max iterations if Loop type
    let loopHTML = "";
    if (aType === 'loop') {
      loopHTML = `
        <div class="form-group">
          <label class="form-label">Max Iterations</label>
          <input type="number" class="form-input agent-max-iter" data-agent="${name}" value="${cfg.max_iterations || 5}" min="1">
        </div>
      `;
    }
    
    // Render WASM module path if WASM type
    let wasmHTML = "";
    if (aType === 'wasm') {
      wasmHTML = `
        <div class="form-group full-width">
          <label class="form-label">WebAssembly Plugin Path (.wasm)</label>
          <input type="text" class="form-input agent-wasm-path" data-agent="${name}" value="${cfg.module_path || ''}" placeholder="e.g. ./plugins/orchestrator.wasm">
        </div>
      `;
    }
    
    // Render LLM/Routing settings (Model + Prompt)
    let llmSettingsHTML = "";
    if (aType === 'llm' || aType === 'routing') {
      llmSettingsHTML = `
        <div class="form-group">
          <label class="form-label">Model Endpoint</label>
          <select class="form-select agent-model" data-agent="${name}">
            ${modelOpts}
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label">System Instructions (Prompt)</label>
          <textarea class="form-textarea agent-instr" data-agent="${name}" rows="5" style="font-family:var(--font-family-mono); font-size:12px;">${cfg.instruction || ''}</textarea>
        </div>
      `;
    }

    // Render Workflow Nodes and Edges builders if Workflow type
    let workflowHTML = "";
    if (aType === 'workflow') {
      const nodeList = cfg.nodes || [];
      const nodeRows = nodeList.map((node, idx) => {
        let targetOpts = `<option value="">Select Target...</option>`;
        targetOpts += `<optgroup label="Agents">`;
        Object.keys(state.agents).forEach(aName => {
          if (aName === name) return;
          targetOpts += `<option value="agent:${aName}" ${node.agent === aName ? 'selected' : ''}>Agent: ${aName}</option>`;
        });
        targetOpts += `</optgroup>`;
        targetOpts += `<optgroup label="Tools">`;
        Object.keys(state.tools).forEach(tName => {
          targetOpts += `<option value="tool:${tName}" ${node.tool === tName ? 'selected' : ''}>Tool: ${tName}</option>`;
        });
        targetOpts += `</optgroup>`;

        return `
          <div class="workflow-node-row flex-row" style="margin-bottom:6px; gap:8px;" data-agent="${name}" data-idx="${idx}">
            <input type="text" class="form-input node-name-input" style="flex:1;" value="${node.name || ''}" placeholder="Node Name (e.g. router)">
            <select class="form-select node-target-select" style="flex:1.5;">
              ${targetOpts}
            </select>
            <button class="btn btn-danger btn-sm btn-remove-wf-node">✕</button>
          </div>
        `;
      }).join('');

      const edgeList = cfg.edges || [];
      const edgeRows = edgeList.map((edge, idx) => {
        let fromOpts = `<option value="START" ${edge.from === 'START' || edge.from === 'start' ? 'selected' : ''}>START</option>`;
        nodeList.forEach(n => {
          if (n.name) {
            fromOpts += `<option value="${n.name}" ${edge.from === n.name ? 'selected' : ''}>${n.name}</option>`;
          }
        });

        let toOpts = `<option value="">Select Target Node...</option>`;
        nodeList.forEach(n => {
          if (n.name) {
            toOpts += `<option value="${n.name}" ${edge.to === n.name ? 'selected' : ''}>${n.name}</option>`;
          }
        });

        return `
          <div class="workflow-edge-row flex-row" style="margin-bottom:6px; gap:8px;" data-agent="${name}" data-idx="${idx}">
            <select class="form-select edge-from-select" style="flex:1.2;">
              ${fromOpts}
            </select>
            <span style="color:var(--text-muted); font-size:12px; align-self:center;">➜</span>
            <select class="form-select edge-to-select" style="flex:1.2;">
              ${toOpts}
            </select>
            <input type="text" class="form-input edge-route-input" style="flex:1;" value="${edge.route || ''}" placeholder="DEFAULT">
            <button class="btn btn-danger btn-sm btn-remove-wf-edge">✕</button>
          </div>
        `;
      }).join('');

      workflowHTML = `
        <div class="form-group full-width" style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="form-label">Workflow DAG Nodes</label>
            <button class="btn btn-add-wf-node" data-agent="${name}" style="padding:4px 8px; font-size:11px;">+ Add Node</button>
          </div>
          <div class="workflow-nodes-container">${nodeRows || '<div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">No nodes configured. Add nodes first.</div>'}</div>
        </div>
        
        <div class="form-group full-width" style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="form-label">Workflow Routing Edges</label>
            <button class="btn btn-add-wf-edge" data-agent="${name}" style="padding:4px 8px; font-size:11px;">+ Add Edge</button>
          </div>
          <div class="workflow-edges-container">${edgeRows || '<div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">No edges configured.</div>'}</div>
        </div>
      `;
    }

    // Render WASM params if WASM agent
    let wasmParamsHTML = "";
    if (aType === 'wasm') {
      const paramsList = Object.entries(cfg.params || {});
      const paramRows = paramsList.map(([key, val], idx) => `
        <div class="wasm-param-row flex-row" style="margin-bottom:6px;" data-agent="${name}" data-idx="${idx}">
          <input type="text" class="form-input wasm-param-key" style="flex:1;" value="${key}" placeholder="Param Key">
          <input type="text" class="form-input wasm-param-val" style="flex:1;" value="${val}" placeholder="Value">
          <button class="btn btn-danger btn-sm btn-remove-wasm-param">✕</button>
        </div>
      `).join('');

      wasmParamsHTML = `
        <div class="form-group full-width" style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="form-label">WASM Custom Configuration Parameters (params)</label>
            <button class="btn btn-add-wasm-param" data-agent="${name}" style="padding:4px 8px; font-size:11px;">+ Add Parameter</button>
          </div>
          <div class="wasm-params-container">${paramRows || '<div style="font-size:12px; color:var(--text-muted);">No custom params configured.</div>'}</div>
        </div>
      `;
    }
    
    card.innerHTML = `
      <div class="item-card-header">
        <div class="flex-row">
          <h4 style="font-family:var(--font-family-display); font-size:16px; font-weight:800; color:white; margin:0;">${name}</h4>
          <span class="item-card-badge" style="background:rgba(99,102,241,0.15); border-color:var(--accent-indigo); color:var(--text-primary); text-transform:uppercase;">${aType}</span>
        </div>
        <button class="btn btn-danger btn-sm delete-agent-btn" data-name="${name}">Remove Agent</button>
      </div>
      
      <div class="form-grid" style="margin-top:12px;">
        <div class="form-group">
          <label class="form-label">Agent Class Type</label>
          <select class="form-select agent-class-type" data-agent="${name}">
            <option value="llm" ${aType === 'llm' ? 'selected' : ''}>Standard LLM Agent (llm)</option>
            <option value="routing" ${aType === 'routing' ? 'selected' : ''}>Role-Based Router (routing)</option>
            <option value="sequential" ${aType === 'sequential' ? 'selected' : ''}>Sequential Orchestrator</option>
            <option value="parallel" ${aType === 'parallel' ? 'selected' : ''}>Parallel Orchestrator</option>
            <option value="loop" ${aType === 'loop' ? 'selected' : ''}>Loop Orchestrator</option>
            <option value="wasm" ${aType === 'wasm' ? 'selected' : ''}>WASM Plugin Agent (wasm)</option>
            <option value="workflow" ${aType === 'workflow' ? 'selected' : ''}>Workflow DAG Agent (workflow)</option>
            <option value="route_generator" ${aType === 'route_generator' ? 'selected' : ''}>Route Generator (route_generator)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" class="form-input agent-desc" data-agent="${name}" value="${cfg.description || ''}" placeholder="Role description">
        </div>
        
        ${loopHTML}
        ${wasmHTML}
        ${llmSettingsHTML}
        
        ${aType === 'llm' || aType === 'routing' ? `
          <div class="form-group full-width">
            <label class="form-label">Assigned Tools</label>
            <div class="selector-chip-container">
              ${toolsChecklist || '<div style="font-size:12px; color:var(--text-muted);">No custom tools defined yet.</div>'}
            </div>
          </div>
        ` : ''}
        
        ${aType !== 'workflow' && aType !== 'route_generator' ? `
        <div class="form-group full-width">
          <label class="form-label">Sub-Agents (Delegates / Routing Path)</label>
          <div class="selector-chip-container">
            ${subAgentsChecklist || '<div style="font-size:12px; color:var(--text-muted);">Add other agents to enable sub-agent transfers.</div>'}
          </div>
        </div>
        ` : ''}
        
        ${mcpHTML}
        ${routingHTML}
        ${workflowHTML}
        ${wasmParamsHTML}
      </div>
    `;
    agentsList.appendChild(card);
  });
  
  // Bind dynamic inputs inside Agent cards
  document.querySelectorAll('.agent-class-type').forEach(select => {
    select.addEventListener('change', (e) => {
      const aName = e.target.getAttribute('data-agent');
      const val = e.target.value;
      state.agents[aName].type = val;
      
      // Cleanup incompatible fields when changing type
      if (val === 'sequential' || val === 'parallel' || val === 'loop' || val === 'wasm' || val === 'workflow' || val === 'route_generator') {
        delete state.agents[aName].model;
        delete state.agents[aName].instruction;
        delete state.agents[aName].tools;
        delete state.agents[aName].mcp_toolsets;
      } else {
        const defaultMod = Object.keys(state.models)[0] || "";
        state.agents[aName].model = defaultMod;
        state.agents[aName].instruction = state.agents[aName].instruction || "Help the user.";
        state.agents[aName].tools = state.agents[aName].tools || [];
      }
      
      if (val === 'loop') {
        state.agents[aName].max_iterations = 5;
      } else {
        delete state.agents[aName].max_iterations;
      }
      
      if (val === 'wasm') {
        state.agents[aName].module_path = "";
        state.agents[aName].params = {};
      } else {
        delete state.agents[aName].module_path;
        delete state.agents[aName].params;
      }
      
      if (val === 'routing') {
        state.agents[aName].admin_users = [];
        state.agents[aName].role_routes = {};
      } else {
        delete state.agents[aName].admin_users;
        delete state.agents[aName].role_routes;
      }

      if (val === 'workflow') {
        state.agents[aName].nodes = [];
        state.agents[aName].edges = [];
        state.agents[aName].sub_agents = [];
      } else {
        delete state.agents[aName].nodes;
        delete state.agents[aName].edges;
        if (val === 'route_generator') {
          delete state.agents[aName].sub_agents;
        } else if (val !== 'llm' && val !== 'routing' && val !== 'sequential' && val !== 'parallel' && val !== 'loop') {
          delete state.agents[aName].sub_agents;
        }
      }
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
      renderTopology();
    });
  });

  document.querySelectorAll('.agent-max-iter').forEach(input => {
    input.addEventListener('change', (e) => {
      const aName = e.target.getAttribute('data-agent');
      state.agents[aName].max_iterations = parseInt(e.target.value) || 5;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.agent-wasm-path').forEach(input => {
    input.addEventListener('input', (e) => {
      const aName = e.target.getAttribute('data-agent');
      state.agents[aName].module_path = e.target.value.trim();
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.route-admins-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const aName = e.target.getAttribute('data-agent');
      state.agents[aName].admin_users = e.target.value.split(',').map(s => s.trim()).filter(s => s);
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  // MCP triggers
  document.querySelectorAll('.btn-add-mcp').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const aName = e.target.getAttribute('data-agent');
      if (!state.agents[aName].mcp_toolsets) {
        state.agents[aName].mcp_toolsets = [];
      }
      state.agents[aName].mcp_toolsets.push({ endpoint: "" });
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.mcp-endpoint-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const row = e.target.closest('.mcp-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      state.agents[aName].mcp_toolsets[idx].endpoint = e.target.value.trim();
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.btn-remove-mcp').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.mcp-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      state.agents[aName].mcp_toolsets.splice(idx, 1);
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  // Routing Rules triggers
  document.querySelectorAll('.btn-add-route-rule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const aName = e.target.getAttribute('data-agent');
      if (!state.agents[aName].role_routes) {
        state.agents[aName].role_routes = {};
      }
      // Add empty route rule
      state.agents[aName].role_routes[""] = "";
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.route-key-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const row = e.target.closest('.route-rule-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      const routesList = Object.entries(state.agents[aName].role_routes || {});
      const oldKey = routesList[idx][0];
      const val = routesList[idx][1];
      const newKey = e.target.value.trim();
      
      if (newKey && newKey !== oldKey) {
        delete state.agents[aName].role_routes[oldKey];
        state.agents[aName].role_routes[newKey] = val;
        localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
        renderVisualEditor();
        syncYAMLFromVisuals();
      }
    });
  });

  document.querySelectorAll('.route-val-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const row = e.target.closest('.route-rule-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      const routesList = Object.entries(state.agents[aName].role_routes || {});
      const key = routesList[idx][0];
      state.agents[aName].role_routes[key] = e.target.value;
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
      renderTopology();
    });
  });

  document.querySelectorAll('.btn-remove-route').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.route-rule-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      const routesList = Object.entries(state.agents[aName].role_routes || {});
      const key = routesList[idx][0];
      delete state.agents[aName].role_routes[key];
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
      renderTopology();
    });
  });
  
  document.querySelectorAll('.agent-desc').forEach(input => {
    input.addEventListener('input', (e) => {
      const aName = e.target.getAttribute('data-agent');
      state.agents[aName].description = e.target.value;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });
  
  document.querySelectorAll('.agent-model').forEach(select => {
    select.addEventListener('change', (e) => {
      const aName = e.target.getAttribute('data-agent');
      state.agents[aName].model = e.target.value;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });
  
  document.querySelectorAll('.agent-instr').forEach(textarea => {
    textarea.addEventListener('input', (e) => {
      const aName = e.target.getAttribute('data-agent');
      state.agents[aName].instruction = e.target.value;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });
  
  // Tool chips check toggles
  document.querySelectorAll('.selector-chip[data-tool]').forEach(chip => {
    chip.addEventListener('click', () => {
      const aName = chip.getAttribute('data-agent');
      const tName = chip.getAttribute('data-tool');
      const isSelected = chip.classList.toggle('selected');
      
      if (!state.agents[aName].tools) state.agents[aName].tools = [];
      
      if (isSelected) {
        if (!state.agents[aName].tools.includes(tName)) {
          state.agents[aName].tools.push(tName);
        }
      } else {
        state.agents[aName].tools = state.agents[aName].tools.filter(t => t !== tName);
      }
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });
  
  // Sub-agent chips check toggles
  document.querySelectorAll('.selector-chip[data-subagent]').forEach(chip => {
    chip.addEventListener('click', () => {
      const aName = chip.getAttribute('data-agent');
      const sName = chip.getAttribute('data-subagent');
      const isSelected = chip.classList.toggle('selected');
      
      if (!state.agents[aName].sub_agents) state.agents[aName].sub_agents = [];
      
      if (isSelected) {
        if (!state.agents[aName].sub_agents.includes(sName)) {
          state.agents[aName].sub_agents.push(sName);
        }
      } else {
        state.agents[aName].sub_agents = state.agents[aName].sub_agents.filter(s => s !== sName);
      }
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
      renderTopology();
    });
  });
  
  // Delete agent action
  document.querySelectorAll('.delete-agent-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-name');
      // Clean subagent lists elsewhere
      Object.values(state.agents).forEach(a => {
        if (a.sub_agents) {
          a.sub_agents = a.sub_agents.filter(s => s !== name);
        }
      });
      delete state.agents[name];
      
      if (state.root_agent === name) {
        state.root_agent = Object.keys(state.agents)[0] || "";
      }
      
      saveStateToProfile(activeProfile);
      renderVisualEditor();
      syncYAMLFromVisuals();
      renderTopology();
    });
  });

  // Workflow nodes builders
  document.querySelectorAll('.btn-add-wf-node').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const aName = e.target.getAttribute('data-agent');
      if (!state.agents[aName].nodes) {
        state.agents[aName].nodes = [];
      }
      state.agents[aName].nodes.push({ name: "", agent: "", tool: "" });
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.node-name-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const row = e.target.closest('.workflow-node-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      state.agents[aName].nodes[idx].name = e.target.value.trim();
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.node-target-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const row = e.target.closest('.workflow-node-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      const val = e.target.value;
      
      if (val.startsWith('agent:')) {
        state.agents[aName].nodes[idx].agent = val.substring(6);
        delete state.agents[aName].nodes[idx].tool;
      } else if (val.startsWith('tool:')) {
        state.agents[aName].nodes[idx].tool = val.substring(5);
        delete state.agents[aName].nodes[idx].agent;
      } else {
        delete state.agents[aName].nodes[idx].agent;
        delete state.agents[aName].nodes[idx].tool;
      }
      
      // Update sub_agents internally
      const subs = new Set();
      state.agents[aName].nodes.forEach(n => {
        if (n.agent) subs.add(n.agent);
      });
      state.agents[aName].sub_agents = Array.from(subs);
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
      renderTopology();
    });
  });

  document.querySelectorAll('.btn-remove-wf-node').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.workflow-node-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      state.agents[aName].nodes.splice(idx, 1);
      
      // Update sub_agents internally
      const subs = new Set();
      state.agents[aName].nodes.forEach(n => {
        if (n.agent) subs.add(n.agent);
      });
      state.agents[aName].sub_agents = Array.from(subs);
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
      renderTopology();
    });
  });

  // Workflow edges builders
  document.querySelectorAll('.btn-add-wf-edge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const aName = e.target.getAttribute('data-agent');
      if (!state.agents[aName].edges) {
        state.agents[aName].edges = [];
      }
      state.agents[aName].edges.push({ from: "START", to: "", route: "" });
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.edge-from-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const row = e.target.closest('.workflow-edge-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      state.agents[aName].edges[idx].from = e.target.value;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.edge-to-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const row = e.target.closest('.workflow-edge-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      state.agents[aName].edges[idx].to = e.target.value;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.edge-route-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const row = e.target.closest('.workflow-edge-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      state.agents[aName].edges[idx].route = e.target.value.trim();
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.btn-remove-wf-edge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.workflow-edge-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      state.agents[aName].edges.splice(idx, 1);
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  // WASM params builders
  document.querySelectorAll('.btn-add-wasm-param').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const aName = e.target.getAttribute('data-agent');
      if (!state.agents[aName].params) {
        state.agents[aName].params = {};
      }
      state.agents[aName].params[""] = "";
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.wasm-param-key').forEach(input => {
    input.addEventListener('change', (e) => {
      const row = e.target.closest('.wasm-param-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      const paramsList = Object.entries(state.agents[aName].params || {});
      const oldKey = paramsList[idx][0];
      const val = paramsList[idx][1];
      const newKey = e.target.value.trim();
      
      if (newKey && newKey !== oldKey) {
        delete state.agents[aName].params[oldKey];
        state.agents[aName].params[newKey] = val;
        localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
        renderVisualEditor();
        syncYAMLFromVisuals();
      }
    });
  });

  document.querySelectorAll('.wasm-param-val').forEach(input => {
    input.addEventListener('input', (e) => {
      const row = e.target.closest('.wasm-param-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      const paramsList = Object.entries(state.agents[aName].params || {});
      const key = paramsList[idx][0];
      state.agents[aName].params[key] = e.target.value;
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      syncYAMLFromVisuals();
    });
  });

  document.querySelectorAll('.btn-remove-wasm-param').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.wasm-param-row');
      const aName = row.getAttribute('data-agent');
      const idx = parseInt(row.getAttribute('data-idx'));
      
      const paramsList = Object.entries(state.agents[aName].params || {});
      const key = paramsList[idx][0];
      delete state.agents[aName].params[key];
      
      localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
      renderVisualEditor();
      syncYAMLFromVisuals();
    });
  });
}

function renderProjectList() {
  projectList.innerHTML = "";
  profiles.forEach(name => {
    const item = document.createElement('div');
    item.className = `project-item ${name === activeProfile ? 'active' : ''}`;
    item.innerHTML = `
      <span>${name}</span>
      ${name !== 'default' ? `<span class="delete-proj-btn" data-name="${name}" style="color:var(--accent-red); font-weight:700; padding:0 4px;">✕</span>` : ''}
    `;
    
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-proj-btn')) {
        e.stopPropagation();
        const toDel = e.target.getAttribute('data-name');
        profiles = profiles.filter(p => p !== toDel);
        localStorage.setItem('vized_profiles', JSON.stringify(profiles));
        localStorage.removeItem(`vized_state_${toDel}`);
        if (activeProfile === toDel) {
          activeProfile = 'default';
        }
        loadStateFromProfile(activeProfile);
        return;
      }
      loadStateFromProfile(name);
    });
    
    projectList.appendChild(item);
  });
}

// Renders the tree topology dynamically
function renderTopology() {
  topologyGraph.innerHTML = "";
  const root = state.root_agent;
  
  if (!root || !state.agents[root]) {
    topologyGraph.innerHTML = `<div style="color:var(--text-muted); font-size:14px;">Define a root agent to visualize routing paths.</div>`;
    return;
  }
  
  const visited = new Set();
  
  function buildNodeHTML(agentName) {
    if (visited.has(agentName)) {
      // Loop safety
      return `
        <div class="topology-branch">
          <div class="topology-node" style="border-color:var(--accent-red);">
            <div class="topology-node-name">${agentName} ⚠️</div>
            <div class="topology-node-info">Recursive Loop</div>
          </div>
        </div>
      `;
    }
    
    visited.add(agentName);
    const agent = state.agents[agentName];
    const subAgents = agent ? agent.sub_agents || [] : [];
    
    let branchesHTML = "";
    if (subAgents.length > 0) {
      branchesHTML = `
        <div class="topology-connector"></div>
        <div class="topology-branches">
          ${subAgents.map(sub => buildNodeHTML(sub)).join('')}
        </div>
      `;
    }
    
    visited.delete(agentName);
    
    return `
      <div class="topology-branch">
        <div class="topology-node ${agentName === root ? 'root' : ''}">
          <div class="topology-node-name">${agentName}</div>
          <div class="topology-node-info">${agent ? (agent.model || 'No model') : 'External'}</div>
          ${agent && agent.tools && agent.tools.length > 0 ? `
            <div style="font-size:9px; color:var(--accent-cyan); margin-top:4px;">🛠️ ${agent.tools.join(', ')}</div>
          ` : ''}
        </div>
        ${branchesHTML}
      </div>
    `;
  }
  
  topologyGraph.innerHTML = buildNodeHTML(root);
}

// ----------------------------------------------------
// UI INTERACTIONS & DOM BINDINGS
// ----------------------------------------------------

function bindUIEvents() {
  
  // Tab Switcher
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-pane').forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const paneId = btn.getAttribute('data-tab');
      document.getElementById(paneId).classList.add('active');
      
      if (paneId === 'tab-topology') {
        renderTopology();
      }
    });
  });
  
  // Sidebar Chat Toggle
  btnToggleChat.addEventListener('click', () => {
    chatSidebar.classList.toggle('collapsed');
  });
  
  // Global form inputs live synchronization
  globalRootAgent.addEventListener('change', (e) => {
    state.root_agent = e.target.value;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
    renderTopology();
  });
  
  sessionProvider.addEventListener('change', (e) => {
    state.session.provider = e.target.value;
    if (e.target.value === 'database') {
      sessionDsnGroup.classList.remove('hidden');
    } else {
      sessionDsnGroup.classList.add('hidden');
    }
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  sessionDriver.addEventListener('input', () => {
    state.session.driver = sessionDriver.value;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  sessionDsn.addEventListener('input', () => {
    state.session.dsn = sessionDsn.value;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  sessionMigrate.addEventListener('change', () => {
    state.session.auto_migrate = sessionMigrate.checked;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  memoryProvider.addEventListener('change', (e) => {
    state.memory.provider = e.target.value;
    if (e.target.value === 'database') {
      memoryDsnGroup.classList.remove('hidden');
    } else {
      memoryDsnGroup.classList.add('hidden');
    }
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  memoryDriver.addEventListener('input', () => {
    state.memory.driver = memoryDriver.value;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  memoryDsn.addEventListener('input', () => {
    state.memory.dsn = memoryDsn.value;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  memoryMigrate.addEventListener('change', () => {
    state.memory.auto_migrate = memoryMigrate.checked;
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  // Launcher flags event listeners
  document.getElementById('flag-console-chip').addEventListener('click', () => {
    state.console = !state.console;
    document.getElementById('flag-console').checked = state.console;
    document.getElementById('flag-console-chip').classList.toggle('selected', state.console);
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  document.getElementById('flag-webui-chip').addEventListener('click', () => {
    state.webui = !state.webui;
    document.getElementById('flag-webui').checked = state.webui;
    document.getElementById('flag-webui-chip').classList.toggle('selected', state.webui);
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  document.getElementById('flag-openclaw-chip').addEventListener('click', () => {
    state.openclaw = !state.openclaw;
    document.getElementById('flag-openclaw').checked = state.openclaw;
    document.getElementById('flag-openclaw-chip').classList.toggle('selected', state.openclaw);
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  document.getElementById('flag-a2a-chip').addEventListener('click', () => {
    state.a2a = !state.a2a;
    document.getElementById('flag-a2a').checked = state.a2a;
    document.getElementById('flag-a2a-chip').classList.toggle('selected', state.a2a);
    localStorage.setItem(`vized_state_${activeProfile}`, JSON.stringify(state));
    syncYAMLFromVisuals();
  });
  
  // YAML Textarea live input sync
  let parseDebounce;
  yamlTextarea.addEventListener('input', (e) => {
    clearTimeout(parseDebounce);
    parseDebounce = setTimeout(() => {
      syncVisualsFromYAML(e.target.value);
    }, 400);
  });
  
  // Modal buttons and overlays
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });
  
  // API settings elements caching
  apiProviderSelect = document.getElementById('api-provider-select');
  apiBaseUrlGroup = document.getElementById('api-base-url-group');
  apiBaseUrlInput = document.getElementById('api-base-url-input');
  apiKeyGroup = document.getElementById('api-key-group');
  apiKeyInput = document.getElementById('api-key-input');
  apiModelSelect = document.getElementById('api-model-select');
  apiCustomModelGroup = document.getElementById('api-custom-model-group');
  apiCustomModelInput = document.getElementById('api-custom-model-input');

  const providerModelsOfflineFallback = {
    gemini: [
      { value: "gemini-2.5-flash", text: "Gemini 2.5 Flash (Recommended)" },
      { value: "gemini-2.0-flash", text: "Gemini 2.0 Flash" },
      { value: "gemini-2.5-pro", text: "Gemini 2.5 Pro" }
    ],
    openai: [
      { value: "gpt-4o", text: "GPT-4o (Recommended)" },
      { value: "gpt-4o-mini", text: "GPT-4o Mini" },
      { value: "o1-mini", text: "o1-mini" }
    ],
    ollama: [
      { value: "llama3.2", text: "Llama 3.2 (Recommended)" },
      { value: "llama3.1", text: "Llama 3.1" },
      { value: "mistral", text: "Mistral" },
      { value: "gemma2", text: "Gemma 2" }
    ]
  };

  async function updateBYOKModelDropdown(provider, selectedModelValue, forceFetch = false) {
    apiModelSelect.innerHTML = "";
    const loadingOpt = document.createElement('option');
    loadingOpt.value = "";
    loadingOpt.textContent = "Retrieving models from API...";
    apiModelSelect.appendChild(loadingOpt);
    apiModelSelect.disabled = true;
    
    const liveKey = apiKeyInput.value.trim();
    const liveUrl = apiBaseUrlInput.value.trim();
    
    let list = [];
    
    // We only fetch from API if forceFetch is true or if we have a key (for Gemini/OpenAI) or if it's Ollama
    if (forceFetch || provider === 'ollama' || liveKey) {
      try {
        if (provider === 'gemini') {
          const endpoint = `${liveUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models?key=${liveKey}`;
          const res = await fetch(endpoint);
          if (!res.ok) throw new Error("Gemini fetch failed");
          const data = await res.json();
          list = (data.models || [])
            .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
            .map(m => {
              const id = m.name.replace(/^models\//, "");
              return { value: id, text: m.displayName || id };
            });
        } else if (provider === 'openai') {
          const endpoint = `${liveUrl || 'https://api.openai.com/v1'}/models`;
          const res = await fetch(endpoint, {
            headers: { "Authorization": `Bearer ${liveKey}` }
          });
          if (!res.ok) throw new Error("OpenAI fetch failed");
          const data = await res.json();
          const filtered = (data.data || []).filter(m => m.id.includes("gpt") || m.id.includes("o1"));
          const srcList = filtered.length > 0 ? filtered : (data.data || []);
          list = srcList.map(m => ({ value: m.id, text: m.id }));
        } else if (provider === 'ollama') {
          const base = liveUrl || "http://localhost:11434/v1";
          let success = false;
          try {
            const res = await fetch(`${base}/models`);
            if (res.ok) {
              const data = await res.json();
              list = (data.data || []).map(m => ({ value: m.id, text: m.id }));
              success = true;
            }
          } catch (e) {}
          
          if (!success) {
            const host = base.replace(/\/v1\/?$/, "");
            const res = await fetch(`${host}/api/tags`);
            if (!res.ok) throw new Error("Ollama fetch failed");
            const data = await res.json();
            list = (data.models || []).map(m => ({ value: m.name, text: m.name }));
          }
        }
      } catch (err) {
        console.warn("Dynamic model fetch failed, falling back to predefined list:", err);
        if (forceFetch) {
          showToast(`Could not fetch models: ${err.message}. Showing offline fallback list.`, "error");
        }
      }
    }
    
    if (list.length === 0) {
      list = providerModelsOfflineFallback[provider] || [];
    }
    
    apiModelSelect.innerHTML = "";
    apiModelSelect.disabled = false;
    
    list.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.text;
      if (m.value === selectedModelValue) {
        opt.selected = true;
      }
      apiModelSelect.appendChild(opt);
    });
    
    const optCustom = document.createElement('option');
    optCustom.value = "custom";
    optCustom.textContent = "Custom Model ID...";
    if (selectedModelValue === 'custom') {
      optCustom.selected = true;
    }
    apiModelSelect.appendChild(optCustom);
    
    const predefinedValues = list.map(m => m.value);
    if (selectedModelValue && !predefinedValues.includes(selectedModelValue) && selectedModelValue !== 'custom') {
      optCustom.selected = true;
      apiCustomModelGroup.classList.remove('hidden');
      apiCustomModelInput.value = selectedModelValue;
    } else if (selectedModelValue === 'custom') {
      apiCustomModelGroup.classList.remove('hidden');
    } else {
      apiCustomModelGroup.classList.add('hidden');
    }
  }

  const defaultProviderUrls = {
    gemini: "https://generativelanguage.googleapis.com",
    openai: "https://api.openai.com/v1",
    ollama: "http://localhost:11434/v1"
  };

  function adjustBYOKFieldVisibilities(provider) {
    const currentValue = apiBaseUrlInput.value.trim();
    const isDefaultUrlOfAnyProvider = Object.values(defaultProviderUrls).includes(currentValue) || currentValue === "";
    
    if (isDefaultUrlOfAnyProvider) {
      apiBaseUrlInput.value = defaultProviderUrls[provider];
    }
    
    if (provider === 'gemini') {
      apiBaseUrlInput.placeholder = "e.g. https://generativelanguage.googleapis.com";
      apiKeyInput.placeholder = "Enter Gemini API Key...";
      apiKeyGroup.classList.remove('hidden');
    } else if (provider === 'openai') {
      apiBaseUrlInput.placeholder = "e.g. https://api.openai.com/v1";
      apiKeyInput.placeholder = "Enter OpenAI API Key...";
      apiKeyGroup.classList.remove('hidden');
    } else if (provider === 'ollama') {
      apiBaseUrlInput.placeholder = "e.g. http://localhost:11434/v1";
      apiKeyInput.placeholder = "Optional password/key...";
      apiKeyGroup.classList.remove('hidden');
    }
  }

  // API settings manager triggers
  document.getElementById('btn-key-mgr').addEventListener('click', () => {
    apiProviderSelect.value = apiProvider;
    apiKeyInput.value = apiKey;
    apiBaseUrlInput.value = apiBaseUrl || defaultProviderUrls[apiProvider];
    
    adjustBYOKFieldVisibilities(apiProvider);
    updateBYOKModelDropdown(apiProvider, apiModel, false);
    
    keyModal.classList.add('active');
  });

  apiProviderSelect.addEventListener('change', (e) => {
    const prov = e.target.value;
    adjustBYOKFieldVisibilities(prov);
    const defaultMod = providerModelsOfflineFallback[prov]?.[0]?.value || "";
    updateBYOKModelDropdown(prov, defaultMod, false);
  });

  document.getElementById('btn-fetch-api-models').addEventListener('click', () => {
    updateBYOKModelDropdown(apiProviderSelect.value, apiModelSelect.value, true);
  });

  apiModelSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      apiCustomModelGroup.classList.remove('hidden');
      apiCustomModelInput.value = apiCustomModel || "";
    } else {
      apiCustomModelGroup.classList.add('hidden');
    }
  });
  
  document.getElementById('btn-save-key').addEventListener('click', () => {
    apiProvider = apiProviderSelect.value;
    apiKey = apiKeyInput.value.trim();
    apiBaseUrl = apiBaseUrlInput.value.trim();
    
    let selectedModel = apiModelSelect.value;
    if (selectedModel === 'custom') {
      apiCustomModel = apiCustomModelInput.value.trim();
      selectedModel = apiCustomModel || "custom";
    }
    
    apiModel = selectedModel;
    geminiApiKey = apiKey; // backward compatibility fallback
    
    localStorage.setItem('vized_api_provider', apiProvider);
    localStorage.setItem('vized_api_key', apiKey);
    localStorage.setItem('vized_gemini_key', apiKey);
    localStorage.setItem('vized_api_base_url', apiBaseUrl);
    localStorage.setItem('vized_api_model', apiModel);
    localStorage.setItem('vized_api_custom_model', apiCustomModel);
    
    keyModal.classList.remove('active');
    showToast(`BYOK settings updated! Provider: ${apiProvider.toUpperCase()}, Model: ${apiModel}`, "success");
  });
  
  // Add model config modal triggers
  document.getElementById('btn-add-model').addEventListener('click', () => {
    document.getElementById('m-name').value = "";
    document.getElementById('m-id').value = "";
    document.getElementById('m-provider').value = "gemini";
    document.getElementById('m-default').checked = false;
    document.getElementById('m-custom-fields').classList.add('hidden');
    modelModal.classList.add('active');
  });
  
  document.getElementById('m-provider').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'ollama' || val === 'ml') {
      document.getElementById('m-custom-fields').classList.remove('hidden');
    } else {
      document.getElementById('m-custom-fields').classList.add('hidden');
    }
  });
  
  document.getElementById('btn-submit-model').addEventListener('click', () => {
    const name = document.getElementById('m-name').value.trim();
    const provider = document.getElementById('m-provider').value;
    const modelId = document.getElementById('m-id').value.trim();
    const isDefault = document.getElementById('m-default').checked;
    
    if (!name || !modelId) {
      showToast("Please enter both Name and Model ID", "error");
      return;
    }
    
    if (isDefault) {
      Object.values(state.models).forEach(m => m.default = false);
    }
    
    state.models[name] = {
      provider: provider,
      model_id: modelId,
      default: isDefault
    };
    
    if (provider === 'ollama') {
      state.models[name].base_url = document.getElementById('m-url').value.trim() || 'http://localhost:11434/v1';
    } else if (provider === 'ml') {
      state.models[name].model_path = document.getElementById('m-path').value.trim() || '';
      state.models[name].threads = 4;
    }
    
    saveStateToProfile(activeProfile);
    renderVisualEditor();
    syncYAMLFromVisuals();
    modelModal.classList.remove('active');
  });
  
  // Add Tool Config triggers
  const toolModalType = document.getElementById('t-type');
  const toolFields = document.getElementById('tool-type-fields');
  
  toolModalType.addEventListener('change', () => {
    const type = toolModalType.value;
    toolFields.innerHTML = "";
    
    if (type === 'gemini') {
      toolFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Gemini Builtin Service Name</label>
          <input type="text" id="t-spec-val" class="form-input" value="google_search" placeholder="google_search">
        </div>
      `;
    } else if (type === 'wasm') {
      toolFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Plugin WASM Module File Path</label>
          <input type="text" id="t-spec-val" class="form-input" placeholder="./plugins/my_tool.wasm">
        </div>
      `;
    } else if (type === 'logic_query') {
      toolFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">Prolog Knowledge Base File Path (.pl)</label>
          <input type="text" id="t-spec-val" class="form-input" placeholder="./knowledge.pl">
        </div>
      `;
    } else if (type === 'userdb') {
      toolFields.innerHTML = `
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group">
            <label class="form-label">DB Driver</label>
            <input type="text" id="t-db-driver" class="form-input" value="postgres" placeholder="postgres">
          </div>
          <div class="form-group">
            <label class="form-label">DB Connection DSN</label>
            <input type="text" id="t-db-dsn" class="form-input" placeholder="postgres://...">
          </div>
          <div class="form-group full-width">
            <label class="form-label">DB Operation (op)</label>
            <select id="t-db-op" class="form-select">
              <option value="get_profile">get_profile</option>
              <option value="create_user">create_user</option>
              <option value="update_status">update_status</option>
            </select>
          </div>
        </div>
      `;
    } else if (type === 'sandbox') {
      let sandboxOpts = `<option value="">-- Inline / Custom Sandbox --</option>`;
      Object.keys(state.sandboxes || {}).forEach(sName => {
        sandboxOpts += `<option value="${sName}">${sName}</option>`;
      });
      toolFields.innerHTML = `
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group full-width">
            <label class="form-label">Reference Registered Sandbox</label>
            <select id="t-sandbox-ref" class="form-select">
              ${sandboxOpts}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Or VM Type</label>
            <input type="text" id="t-sandbox-type" class="form-input" value="gno" placeholder="gno | quickjs | starlark">
          </div>
          <div class="form-group">
            <label class="form-label">Execution Timeout</label>
            <input type="text" id="t-sandbox-timeout" class="form-input" value="5s" placeholder="5s">
          </div>
          <div class="form-group">
            <label class="form-label">Memory Limit (MB)</label>
            <input type="number" id="t-sandbox-mem" class="form-input" value="128" placeholder="128">
          </div>
        </div>
      `;
    }
  });
  
  // Tool parameters rows builder
  function addToolParamRow(pName = "", pType = "string", pReq = false) {
    const list = document.getElementById('tool-params-list');
    const row = document.createElement('div');
    row.className = "tool-param-row";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "2fr 1fr auto auto";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.marginBottom = "6px";
    
    row.innerHTML = `
      <input type="text" class="form-input param-name" value="${pName}" placeholder="parameter_name" style="padding:6px 10px;">
      <select class="form-select param-type" style="padding:6px 10px;">
        <option value="string" ${pType === 'string' ? 'selected' : ''}>string</option>
        <option value="number" ${pType === 'number' ? 'selected' : ''}>number</option>
        <option value="boolean" ${pType === 'boolean' ? 'selected' : ''}>boolean</option>
        <option value="array" ${pType === 'array' ? 'selected' : ''}>array</option>
        <option value="object" ${pType === 'object' ? 'selected' : ''}>object</option>
      </select>
      <label style="display:flex; align-items:center; gap:4px; font-size:11px; margin:0; cursor:pointer;">
        <input type="checkbox" class="param-req" ${pReq ? 'checked' : ''}> Req
      </label>
      <button type="button" class="btn btn-danger btn-remove-param" style="padding:6px 10px; min-width:32px; display:flex; align-items:center; justify-content:center;">✕</button>
    `;
    
    row.querySelector('.btn-remove-param').addEventListener('click', () => {
      row.remove();
    });
    
    list.appendChild(row);
  }

  document.getElementById('btn-add-tool-param').addEventListener('click', () => {
    addToolParamRow("", "string", false);
  });

  document.getElementById('btn-add-tool').addEventListener('click', () => {
    document.getElementById('t-name').value = "";
    document.getElementById('t-desc').value = "";
    document.getElementById('tool-params-list').innerHTML = "";
    toolModalType.value = "gemini";
    toolFields.innerHTML = `
      <div class="form-group">
        <label class="form-label">Gemini Builtin Service Name</label>
        <input type="text" id="t-spec-val" class="form-input" value="google_search" placeholder="google_search">
      </div>
    `;
    toolModal.classList.add('active');
  });
  
  document.getElementById('btn-submit-tool').addEventListener('click', () => {
    const name = document.getElementById('t-name').value.trim();
    const type = toolModalType.value;
    const desc = document.getElementById('t-desc').value.trim();
    
    if (!name) {
      showToast("Tool name is required.", "error");
      return;
    }
    
    const tCfg = {
      type: type,
      description: desc
    };
    
    const specInput = document.getElementById('t-spec-val');
    if (type === 'gemini' && specInput) {
      tCfg.tool = specInput.value.trim() || 'google_search';
    } else if (type === 'wasm' && specInput) {
      tCfg.module_path = specInput.value.trim() || '';
    } else if (type === 'logic_query' && specInput) {
      tCfg.kb_path = specInput.value.trim() || '';
    } else if (type === 'userdb') {
      tCfg.op = document.getElementById('t-db-op').value;
      tCfg.db = {
        driver: document.getElementById('t-db-driver').value.trim() || 'postgres',
        dsn: document.getElementById('t-db-dsn').value.trim() || ''
      };
    } else if (type === 'sandbox') {
      const ref = document.getElementById('t-sandbox-ref').value;
      if (ref) {
        tCfg.sandbox = ref;
      } else {
        tCfg.type = document.getElementById('t-sandbox-type').value.trim() || 'gno';
        tCfg.timeout = document.getElementById('t-sandbox-timeout').value.trim() || '5s';
        tCfg.memory_limit_mb = parseInt(document.getElementById('t-sandbox-mem').value) || 128;
      }
    }
    
    // Parse dynamic parameters list
    tCfg.parameters = {};
    document.querySelectorAll('.tool-param-row').forEach(row => {
      const pName = row.querySelector('.param-name').value.trim();
      const pType = row.querySelector('.param-type').value;
      const pReq = row.querySelector('.param-req').checked;
      if (pName) {
        tCfg.parameters[pName] = {
          type: pType,
          required: pReq
        };
      }
    });
    
    if (Object.keys(tCfg.parameters).length === 0) {
      delete tCfg.parameters;
    }
    
    state.tools[name] = tCfg;
    saveStateToProfile(activeProfile);
    renderVisualEditor();
    syncYAMLFromVisuals();
    toolModal.classList.remove('active');
  });
  
  // Add Agent trigger
  document.getElementById('btn-add-agent').addEventListener('click', () => {
    const name = prompt("Enter new Agent Node Name:");
    if (!name) return;
    const cleanName = name.replace(/\s+/g, '');
    if (state.agents[cleanName]) {
      showToast("Agent name already exists!", "error");
      return;
    }
    
    const defaultModel = Object.keys(state.models)[0] || "";
    
    state.agents[cleanName] = {
      description: `${cleanName} assistant`,
      model: defaultModel,
      instruction: `You are ${cleanName}, a specialized sub-agent. Help the user with your specialized skills.\n`,
      tools: [],
      sub_agents: []
    };
    
    saveStateToProfile(activeProfile);
    renderVisualEditor();
    syncYAMLFromVisuals();
    renderTopology();
  });
  
  // Import YAML Modal trigger
  document.getElementById('btn-import-yaml').addEventListener('click', () => {
    document.getElementById('import-yaml-textarea').value = "";
    importModal.classList.add('active');
  });
  
  document.getElementById('btn-submit-import').addEventListener('click', () => {
    const yaml = document.getElementById('import-yaml-textarea').value;
    if (!yaml.trim()) {
      showToast("Nothing to import", "error");
      return;
    }
    syncVisualsFromYAML(yaml);
    importModal.classList.remove('active');
    showToast("Import successful!", "success");
  });
  
  // Export YAML (Direct Download)
  document.getElementById('btn-export-yaml').addEventListener('click', () => {
    const content = yamlTextarea.value;
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProfile}_agent.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded agent configuration YAML!", "success");
  });
  
  // New config action
  document.getElementById('btn-new-project').addEventListener('click', () => {
    document.getElementById('proj-name-input').value = "";
    projectModal.classList.add('active');
  });
  
  document.getElementById('btn-submit-project').addEventListener('click', () => {
    const name = document.getElementById('proj-name-input').value.trim();
    if (!name) return;
    const safeName = name.replace(/\s+/g, '-').toLowerCase();
    
    state = JSON.parse(JSON.stringify(defaultState));
    saveStateToProfile(safeName);
    loadStateFromProfile(safeName);
    projectModal.classList.remove('active');
  });
  
  // Save active config
  document.getElementById('btn-save-project').addEventListener('click', () => {
    saveStateToProfile(activeProfile);
  });
  
  // Suggestion chips triggers
  document.querySelectorAll('.chip[data-prompt]').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.getAttribute('data-prompt');
      chatInput.focus();
    });
  });
  
  // Clear chat logs
  btnClearChat.addEventListener('click', () => {
    chatHistory = [];
    localStorage.removeItem('vized_chat_history');
    chatMessages.innerHTML = `
      <div class="message assistant">
        <span class="sender-label">Assistant</span>
        <div class="message-content">
          <p>Chat logs cleared. Describe the usecase you would like to design!</p>
        </div>
      </div>
    `;
  });
  
  // AI Form submission chat builder
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleChatSubmission();
  });
  
  // Enter submits chat unless Shift is held
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmission();
    }
  });

  // VM Sandbox Modal Event Listeners
  document.getElementById('btn-add-sandbox').addEventListener('click', () => {
    document.getElementById('s-name').value = "";
    document.getElementById('s-type').value = "quickjs";
    document.getElementById('s-memory').value = "128";
    document.getElementById('s-timeout').value = "5s";
    document.getElementById('s-net').value = "";
    
    // Tools list
    const toolsContainer = document.getElementById('sandbox-tools-list');
    toolsContainer.innerHTML = "";
    Object.keys(state.tools).forEach(tName => {
      const chip = document.createElement('div');
      chip.className = "selector-chip";
      chip.innerHTML = `<input type="checkbox" style="display:none;" value="${tName}"> ${tName}`;
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        const chk = chip.querySelector('input');
        chk.checked = !chk.checked;
      });
      toolsContainer.appendChild(chip);
    });
    
    document.getElementById('sandbox-env-list').innerHTML = "";
    document.getElementById('sandbox-modal').classList.add('active');
  });

  function addSandboxEnvRow(key = "", val = "") {
    const list = document.getElementById('sandbox-env-list');
    const row = document.createElement('div');
    row.className = "sandbox-env-row";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr 1fr auto";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.marginBottom = "6px";
    
    row.innerHTML = `
      <input type="text" class="form-input env-key" value="${key}" placeholder="VAR_NAME" style="padding:6px 10px;">
      <input type="text" class="form-input env-val" value="${val}" placeholder="value" style="padding:6px 10px;">
      <button type="button" class="btn btn-danger btn-remove-env" style="padding:6px 10px; min-width:32px; display:flex; align-items:center; justify-content:center;">✕</button>
    `;
    
    row.querySelector('.btn-remove-env').addEventListener('click', () => {
      row.remove();
    });
    
    list.appendChild(row);
  }

  document.getElementById('btn-add-sandbox-env').addEventListener('click', () => {
    addSandboxEnvRow("", "");
  });

  document.getElementById('btn-submit-sandbox').addEventListener('click', () => {
    const name = document.getElementById('s-name').value.trim();
    const type = document.getElementById('s-type').value;
    const mem = parseInt(document.getElementById('s-memory').value) || 128;
    const timeout = document.getElementById('s-timeout').value.trim() || '5s';
    const netRaw = document.getElementById('s-net').value.trim();
    
    if (!name) {
      showToast("Sandbox name is required", "error");
      return;
    }
    
    const allowedNet = netRaw ? netRaw.split(',').map(s => s.trim()).filter(s => s) : [];
    
    // Checked tools
    const allowedTools = [];
    document.querySelectorAll('#sandbox-tools-list .selector-chip.selected input').forEach(chk => {
      allowedTools.push(chk.value);
    });
    
    // Env vars
    const env = {};
    document.querySelectorAll('.sandbox-env-row').forEach(row => {
      const k = row.querySelector('.env-key').value.trim();
      const v = row.querySelector('.env-val').value;
      if (k) {
        env[k] = v;
      }
    });
    
    if (!state.sandboxes) state.sandboxes = {};
    
    state.sandboxes[name] = {
      type: type,
      memory_limit_mb: mem,
      timeout: timeout,
      allow_net: allowedNet,
      allow_tools: allowedTools,
      env: env
    };
    
    saveStateToProfile(activeProfile);
    renderVisualEditor();
    syncYAMLFromVisuals();
    document.getElementById('sandbox-modal').classList.remove('active');
  });

  // Lifecycle Plugin Modal Event Listeners
  const pluginModalType = document.getElementById('p-type');
  const pluginFields = document.getElementById('plugin-type-fields');
  
  function updatePluginModalFields(type) {
    pluginFields.innerHTML = "";
    if (type === 'retry_and_reflect') {
      pluginFields.innerHTML = `
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group">
            <label class="form-label">Max Retries</label>
            <input type="number" id="p-retry-max" class="form-input" value="3" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Plugin Scope</label>
            <select id="p-retry-scope" class="form-select">
              <option value="invocation">invocation</option>
              <option value="global">global</option>
            </select>
          </div>
          <div class="form-group full-width" style="padding-top:8px;">
            <label class="form-label" style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="p-retry-err" style="width:16px; height:16px;"> Error if retries exceeded
            </label>
          </div>
        </div>
      `;
    } else if (type === 'wasm') {
      pluginFields.innerHTML = `
        <div class="form-group">
          <label class="form-label">WASM Module File Path</label>
          <input type="text" id="p-wasm-path" class="form-input" placeholder="./plugins/plugin.wasm">
        </div>
        <div style="border-top:1px solid var(--border-color); margin-top:12px; padding-top:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="form-label" style="margin:0;">Custom Configuration (Params)</label>
            <button type="button" id="btn-add-plugin-config" class="btn" style="padding:4px 8px; font-size:11px;">+ Add Config Param</button>
          </div>
          <div id="plugin-config-list" style="display:flex; flex-direction:column; gap:8px;">
            <!-- Dynamic plugin config rows -->
          </div>
        </div>
      `;
      
      document.getElementById('btn-add-plugin-config').addEventListener('click', () => {
        addPluginConfigRow("", "");
      });
    }
  }

  function addPluginConfigRow(key = "", val = "") {
    const list = document.getElementById('plugin-config-list');
    const row = document.createElement('div');
    row.className = "plugin-config-row";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr 1fr auto";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.marginBottom = "6px";
    
    row.innerHTML = `
      <input type="text" class="form-input config-key" value="${key}" placeholder="Param Key" style="padding:6px 10px;">
      <input type="text" class="form-input config-val" value="${val}" placeholder="value" style="padding:6px 10px;">
      <button type="button" class="btn btn-danger btn-remove-config" style="padding:6px 10px; min-width:32px; display:flex; align-items:center; justify-content:center;">✕</button>
    `;
    
    row.querySelector('.btn-remove-config').addEventListener('click', () => {
      row.remove();
    });
    
    list.appendChild(row);
  }

  pluginModalType.addEventListener('change', () => {
    updatePluginModalFields(pluginModalType.value);
  });

  document.getElementById('btn-add-plugin').addEventListener('click', () => {
    document.getElementById('p-name').value = "";
    pluginModalType.value = "logging";
    updatePluginModalFields("logging");
    document.getElementById('plugin-modal').classList.add('active');
  });

  document.getElementById('btn-submit-plugin').addEventListener('click', () => {
    const name = document.getElementById('p-name').value.trim();
    const type = pluginModalType.value;
    
    if (!name) {
      showToast("Plugin name is required", "error");
      return;
    }
    
    const pCfg = {
      type: type,
      name: name
    };
    
    if (type === 'retry_and_reflect') {
      pCfg.max_retries = parseInt(document.getElementById('p-retry-max').value) || 3;
      pCfg.scope = document.getElementById('p-retry-scope').value;
      pCfg.error_if_retry_exceeded = document.getElementById('p-retry-err').checked;
    } else if (type === 'wasm') {
      pCfg.module_path = document.getElementById('p-wasm-path').value.trim();
      pCfg.config = {};
      document.querySelectorAll('.plugin-config-row').forEach(row => {
        const k = row.querySelector('.config-key').value.trim();
        const v = row.querySelector('.config-val').value;
        if (k) {
          pCfg.config[k] = v;
        }
      });
      if (Object.keys(pCfg.config).length === 0) {
        delete pCfg.config;
      }
    }
    
    if (!state.plugins) state.plugins = [];
    state.plugins.push(pCfg);
    
    saveStateToProfile(activeProfile);
    renderVisualEditor();
    syncYAMLFromVisuals();
    document.getElementById('plugin-modal').classList.remove('active');
  });
}

// ----------------------------------------------------
// BYOK GEMINI AI ASSISTANT CHAT HANDLERS
// ----------------------------------------------------

function loadChatHistory() {
  const history = localStorage.getItem('vized_chat_history');
  if (history) {
    chatHistory = JSON.parse(history);
    chatHistory.forEach(msg => {
      appendChatMessageUI(msg.role, msg.text);
    });
  }
}

function appendChatMessageUI(role, text) {
  const isUser = role === 'user';
  const bubble = document.createElement('div');
  bubble.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  const label = isUser ? 'User' : 'Assistant';
  
  // Render Markdown to HTML if marked is loaded
  let formattedText = text;
  if (window.marked && !isUser) {
    formattedText = marked.parse(text);
  } else {
    // Basic escapes
    formattedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }
  
  bubble.innerHTML = `
    <span class="sender-label">${label}</span>
    <div class="message-content">${formattedText}</div>
  `;
  
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Inject "Apply Configuration" button if YAML block is found in Assistant text
  if (!isUser && text.includes('```yaml')) {
    const applyBtn = document.createElement('button');
    applyBtn.className = "btn btn-primary apply-block-btn";
    applyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Apply Generated Config to Editor
    `;
    
    // Extract the YAML substring
    const startIdx = text.indexOf('```yaml') + 7;
    const endIdx = text.indexOf('```', startIdx);
    
    if (startIdx > 6 && endIdx > startIdx) {
      const extractedYaml = text.substring(startIdx, endIdx).trim();
      applyBtn.addEventListener('click', () => {
        syncVisualsFromYAML(extractedYaml);
        showToast("Synchronized AI generated configuration!", "success");
      });
      bubble.querySelector('.message-content').appendChild(applyBtn);
    }
  }
}

async function handleChatSubmission() {
  const text = chatInput.value.trim();
  if (!text) return;
  
  // Check credentials depending on provider
  if (apiProvider !== 'ollama' && !apiKey) {
    showToast(`Please register your ${apiProvider.toUpperCase()} API key first using the 'BYOK Settings' navbar button.`, "error");
    keyModal.classList.add('active');
    return;
  }
  
  // Append user bubble
  appendChatMessageUI('user', text);
  chatHistory.push({ role: 'user', text: text });
  localStorage.setItem('vized_chat_history', JSON.stringify(chatHistory));
  
  chatInput.value = "";
  
  // Create typing status loading bubble
  const typingBubble = document.createElement('div');
  typingBubble.className = "message assistant typing-indicator";
  typingBubble.innerHTML = `
    <span class="sender-label">Assistant</span>
    <div class="message-content"><p>Architecting configuration... Please wait.</p></div>
  `;
  chatMessages.appendChild(typingBubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Construct context payload with developer schema rules
  const systemPrompt = `You are a professional assistant specialized in designing Go Agentic structures.
Your sole job is to design, generate, and edit config files matching the strict framework schema (Agentic v2 specification).

Strict Schema Rules:
- root_agent: <AgentName> (Entrypoint agent. Defaults to RootAgent if omitted)
- console: <boolean, optional> (Enable console launcher)
- webui: <boolean, optional> (Enable Web UI launcher)
- openclaw: <boolean, optional> (Enable OpenClaw WebSocket gateway)
- a2a: <boolean, optional> (Enable Agent-to-Agent launcher)

- models:
    <alias>:
      provider: [gemini|openai|ollama|ml]
      model_id: <string>
      default: <boolean>
      api_key: <string, optional>
      base_url: <string, optional>
      model_path: <string, optional, for local GGUF models>
      threads: <number, optional, for local GGUF models>

- session: (optional)
    provider: [database|inmemory|gnogent|vertexai]
    driver: [postgres|sqlite]
    dsn: <string>
    auto_migrate: <boolean>

- memory: (optional)
    provider: [database|inmemory|gnogent|prolog]
    driver: [postgres|sqlite]
    dsn: <string>
    auto_migrate: <boolean>
    kb_path: <string, optional, for prolog memory>

- auth: (optional)
    jwt:
      public_key_path: <string>
      issuer: <string>
      audience: <string>

- plugins: (optional list of framework plugins)
    - type: [logging|retry_and_reflect|wasm]
      name: <string>
      # if type is retry_and_reflect:
      max_retries: <number>
      error_if_retry_exceeded: <boolean>
      scope: [invocation|global]
      # if type is wasm:
      module_path: <string>
      config: <map of custom parameters, optional>

- tools:
    <tool_name>:
      type: [builtin|gemini|sandbox|userdb|wasm|logic_query]
      description: <string>
      parameters: (optional map of parameter schemas)
        <param_name>: { type: [string|number|boolean], description: <string, optional>, required: <boolean> }
      # type-specific fields:
      # if type is gemini:
      tool: [google_search]
      # if type is sandbox:
      type: [gno] # VM type
      timeout: <string, e.g. 5s>
      memory_limit_mb: <number, e.g. 128>
      allow_tools: <boolean, optional>
      allow_net: <boolean, optional>
      env: <map of environment variables, optional>
      # if type is userdb:
      op: [get_profile|create_user|update_status|update_roles|update_channels|delete_user]
      db: { driver: [postgres|sqlite], dsn: <string> }
      # if type is wasm:
      module_path: <string>
      security: { allowed_paths: [list of strings], allowed_domains: [list of strings] }
      # if type is logic_query:
      kb_path: <string> # path to prolog knowledge base, e.g., ./knowledge.pl

- agents:
    <AgentName>:
      type: [llm|sequential|parallel|loop|workflow|routing|wasm|gnogent|route_generator] (default is llm)
      description: <string>
      # for llm, routing, workflow, gnogent, wasm agents:
      model: <model_alias>
      instruction: |
        <multiline instruction block>
      tools: [list of tool names]
      sub_agents: [list of other agent names for transfers / orchestration]
      mcp_toolsets: (optional list of external MCP servers)
        - endpoint: <url>
      # if type is loop:
      max_iterations: <number>
      # if type is routing:
      admin_users: [list of strings]
      role_routes:
        <role_name>: <sub_agent_name>
      # if type is wasm:
      module_path: <string>
      # if type is workflow (DAG-based workflow):
      nodes:
        - name: <node_name>
          agent: <agent_name, optional>
          tool: <tool_name, optional>
      edges:
        - from: [START|<node_name>]
          to: <node_name>
          route: [DEFAULT|true|false|<custom_routing_value>]

Always supply the full, valid YAML configuration inside a standard markdown code block:
\`\`\`yaml
<complete yaml config>
\`\`\`

Explain your architectural additions clearly first, then output the pristine YAML.
Current Editor Config state is provided below for continuous editing context:
\`\`\`yaml
${yamlTextarea.value}
\`\`\``;

  try {
    let assistantText = "";
    
    if (apiProvider === 'gemini') {
      const activeModel = apiModel || "gemini-2.5-flash";
      const endpoint = `${apiBaseUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
      
      const contents = [
        {
          role: "user",
          parts: [{ text: systemPrompt }]
        }
      ];
      
      chatHistory.slice(-6).forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        })
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Gemini API Request failed");
      }
      
      const data = await response.json();
      assistantText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I was unable to synthesize a response.";
      
    } else {
      // OpenAI or Ollama standard Chat Completions
      let endpoint = "";
      if (apiProvider === 'openai') {
        endpoint = `${apiBaseUrl || 'https://api.openai.com/v1'}/chat/completions`;
      } else if (apiProvider === 'ollama') {
        endpoint = `${apiBaseUrl || 'http://localhost:11434/v1'}/chat/completions`;
      }
      
      const headers = {
        "Content-Type": "application/json"
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      
      const messages = [
        { role: "system", content: systemPrompt }
      ];
      
      chatHistory.slice(-6).forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text
        });
      });
      
      const activeModel = apiModel || (apiProvider === 'openai' ? "gpt-4o" : "llama3.2");
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          model: activeModel,
          messages: messages,
          temperature: 0.2
        })
      });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP Request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      assistantText = data.choices?.[0]?.message?.content || "I was unable to synthesize a response.";
    }
    
    typingBubble.remove();
    appendChatMessageUI('assistant', assistantText);
    chatHistory.push({ role: 'assistant', text: assistantText });
    localStorage.setItem('vized_chat_history', JSON.stringify(chatHistory));
    
  } catch (err) {
    typingBubble.remove();
    appendChatMessageUI('assistant', `⚠️ **Error coordinating with ${apiProvider.toUpperCase()}:** ${err.message}`);
    showToast(`${apiProvider.toUpperCase()} API call failed. Verify your settings and connection.`, "error");
  }
}
