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
    
    if (state.agents && Object.keys(state.agents).length > 0) {
      out.agents = state.agents;
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
      models: parsed.models || {},
      session: parsed.session || { provider: "" },
      memory: parsed.memory || { provider: "" },
      auth: parsed.auth || { jwt: { public_key_path: "", issuer: "", audience: "" } },
      tools: parsed.tools || {},
      agents: parsed.agents || {}
    };
    
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
  
  // Model Cards
  renderModelCards();
  
  // Tool Cards
  renderToolCards();
  
  // Agent Cards
  renderAgentCards();
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
        <div style="font-style: italic; line-height: 1.4;">${cfg.description || 'No description provided.'}</div>
        ${cfg.tool ? `<div><strong>Builtin:</strong> ${cfg.tool}</div>` : ''}
        ${cfg.module_path ? `<div><strong>Wasm Module:</strong> ${cfg.module_path}</div>` : ''}
        ${cfg.kb_path ? `<div><strong>Prolog KB:</strong> ${cfg.kb_path}</div>` : ''}
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
      renderTopology();
    });
  });
}

function renderAgentCards() {
  agentsList.innerHTML = "";
  
  Object.entries(state.agents).forEach(([name, cfg]) => {
    const card = document.createElement('div');
    card.className = "section-card";
    card.style.background = "rgba(20, 27, 45, 0.4)";
    
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
    
    card.innerHTML = `
      <div class="item-card-header">
        <h4 style="font-family:var(--font-family-display); font-size:16px; font-weight:800; color:white;">${name}</h4>
        <button class="btn btn-danger btn-sm delete-agent-btn" data-name="${name}">Remove Agent</button>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" class="form-input agent-desc" data-agent="${name}" value="${cfg.description || ''}" placeholder="Role description">
        </div>
        <div class="form-group">
          <label class="form-label">Model Endpoint</label>
          <select class="form-select agent-model" data-agent="${name}">
            ${modelOpts}
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Assigned Tools</label>
          <div class="selector-chip-container">
            ${toolsChecklist || '<div style="font-size:12px; color:var(--text-muted);">No custom tools defined yet.</div>'}
          </div>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Sub-Agents (Delegates / Routing Path)</label>
          <div class="selector-chip-container">
            ${subAgentsChecklist || '<div style="font-size:12px; color:var(--text-muted);">Add other agents to enable sub-agent transfers.</div>'}
          </div>
        </div>
        <div class="form-group full-width">
          <label class="form-label">System Instructions (Prompt)</label>
          <textarea class="form-textarea agent-instr" data-agent="${name}" rows="5" style="font-family:var(--font-family-mono); font-size:12px;">${cfg.instruction || ''}</textarea>
        </div>
      </div>
    `;
    agentsList.appendChild(card);
  });
  
  // Bind dynamic inputs inside Agent cards
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

  const providerModels = {
    gemini: [
      { value: "gemini-2.5-flash", text: "Gemini 2.5 Flash (Recommended)" },
      { value: "gemini-2.0-flash", text: "Gemini 2.0 Flash" },
      { value: "gemini-2.5-pro", text: "Gemini 2.5 Pro" },
      { value: "custom", text: "Custom Model ID..." }
    ],
    openai: [
      { value: "gpt-4o", text: "GPT-4o (Recommended)" },
      { value: "gpt-4o-mini", text: "GPT-4o Mini" },
      { value: "o1-mini", text: "o1-mini" },
      { value: "custom", text: "Custom Model ID..." }
    ],
    ollama: [
      { value: "llama3.2", text: "Llama 3.2 (Recommended)" },
      { value: "llama3.1", text: "Llama 3.1" },
      { value: "mistral", text: "Mistral" },
      { value: "gemma2", text: "Gemma 2" },
      { value: "custom", text: "Custom Model ID..." }
    ]
  };

  function updateBYOKModelDropdown(provider, selectedModelValue) {
    apiModelSelect.innerHTML = "";
    const list = providerModels[provider] || [];
    list.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.text;
      if (m.value === selectedModelValue) {
        opt.selected = true;
      }
      apiModelSelect.appendChild(opt);
    });
    
    const predefinedValues = list.map(m => m.value);
    if (selectedModelValue && !predefinedValues.includes(selectedModelValue)) {
      const opt = document.createElement('option');
      opt.value = "custom";
      opt.textContent = "Custom Model ID...";
      opt.selected = true;
      apiModelSelect.appendChild(opt);
      
      apiCustomModelGroup.classList.remove('hidden');
      apiCustomModelInput.value = selectedModelValue;
    } else if (selectedModelValue === 'custom') {
      apiCustomModelGroup.classList.remove('hidden');
    } else {
      apiCustomModelGroup.classList.add('hidden');
    }
  }

  function adjustBYOKFieldVisibilities(provider) {
    if (provider === 'gemini') {
      apiBaseUrlInput.placeholder = "e.g. https://generativelanguage.googleapis.com";
      apiBaseUrlInput.value = apiBaseUrl || "";
      apiKeyInput.placeholder = "Enter Gemini API Key...";
      apiKeyGroup.classList.remove('hidden');
    } else if (provider === 'openai') {
      apiBaseUrlInput.placeholder = "e.g. https://api.openai.com/v1";
      apiBaseUrlInput.value = apiBaseUrl || "";
      apiKeyInput.placeholder = "Enter OpenAI API Key...";
      apiKeyGroup.classList.remove('hidden');
    } else if (provider === 'ollama') {
      apiBaseUrlInput.placeholder = "e.g. http://localhost:11434/v1";
      apiBaseUrlInput.value = apiBaseUrl || "http://localhost:11434/v1";
      apiKeyInput.placeholder = "Optional password/key...";
      apiKeyGroup.classList.remove('hidden');
    }
  }

  // API settings manager triggers
  document.getElementById('btn-key-mgr').addEventListener('click', () => {
    apiProviderSelect.value = apiProvider;
    apiKeyInput.value = apiKey;
    apiBaseUrlInput.value = apiBaseUrl;
    
    adjustBYOKFieldVisibilities(apiProvider);
    updateBYOKModelDropdown(apiProvider, apiModel);
    
    keyModal.classList.add('active');
  });

  apiProviderSelect.addEventListener('change', (e) => {
    const prov = e.target.value;
    adjustBYOKFieldVisibilities(prov);
    const defaultMod = providerModels[prov]?.[0]?.value || "";
    updateBYOKModelDropdown(prov, defaultMod);
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
    }
  });
  
  document.getElementById('btn-add-tool').addEventListener('click', () => {
    document.getElementById('t-name').value = "";
    document.getElementById('t-desc').value = "";
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
Your sole job is to design, generate, and edit config files matching the strict framework schema.

Strict Schema Rules:
- root_agent: <AgentName>
- models:
    <alias>: { provider: [gemini|openai|ollama|ml], model_id: <string>, default: [true|false], base_url: <string, optional>, model_path: <string, optional> }
- tools:
    <tool_name>: { type: [builtin|gemini|sandbox|userdb|wasm|logic_query], description: <string>, tool: <string, optional for gemini google_search>, op: <string, optional for userdb>, db: {driver: <string>, dsn: <string>}, kb_path: <string, optional for logic_query>, module_path: <string, optional for wasm> }
- agents:
    <AgentName>:
      description: <string>
      model: <model_alias>
      instruction: |
        <multiline instruction block>
      tools: [list of tool names]
      sub_agents: [list of other agent names for transfer_to_agent routing]

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
