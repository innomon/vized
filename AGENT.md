# VizEd — Visual Agent Editor for Agentic Framework

VizEd is a premium, client-side-only Progressive Web App (PWA) designed to visually draft, configure, and orchestrate agent systems for the Go-based Agentic framework. 

With **Bring Your Own Key (BYOK)** security, an **interactive AI Chat Assistant**, and a **dual Visual-YAML editor with bidirectional synchronization**, VizEd streamlines building complex, multi-agent pipelines without manual YAML editing.

---

## 🚀 Key Features

*   **100% Client-Side PWA:** No backend servers, databases, or user registration. Your API settings, keys, chat history, and agent configs stay safely inside your browser's private storage. Works offline!
*   **BYOK (Bring Your Own Key):** Secured directly via your own API credentials. Supports **Google Gemini**, **OpenAI**, or **Local Ollama** models running on your machine.
*   **Generative AI Chat Architect:** Describe what you want to achieve in plain English. The assistant connects directly to your chosen provider to instantly write, refine, and format the Go-compatible `agent.yaml` configuration.
*   **Form-Based Visual Designer:** Edit global metadata, register custom or built-in tools (Google Search, logic queries, user databases, WASM), configure model endpoints, and structure your agent trees using high-fidelity forms.
*   **Bidirectional Synchronization:** Edit in the form GUI, and the YAML updates immediately. Edit in the YAML code editor, and the Visual forms sync back in real-time.
*   **Visual Topology Visualizer:** An automatically updated network graph displaying the root agent and its specialized sub-agent transfer pathways.
*   **Local Project Storage:** Keep a dashboard of multiple agent configurations, edit history, and chat logs inside your browser's local sandbox.

---

## 🛠️ Getting Started

### 1. Installation
Since VizEd is a PWA, you can run it directly in any modern browser. 
1. Open the VizEd index page.
2. In your browser's address bar, click the **Install App** icon (or select "Add to Home Screen" on mobile) to save VizEd as a standalone desktop application.
3. The app is now available in your launcher and can run entirely offline.

### 2. Set Up Your API Key & Provider (BYOK)
To use the AI Chat Architect:
1. Click the **BYOK Settings** (key icon) in the top menu bar.
2. Select your desired **API Provider**: Google Gemini, OpenAI, or Local Ollama.
3. Configure the settings:
   *   **API Base URL**: Keeps the default endpoint or allows overrides (e.g., local proxies or Ollama `http://localhost:11434/v1`).
   *   **API Key**: Enter your secret token (optional for Ollama).
   *   **Select Model**: Choose from the list of supported models (e.g. `gemini-2.5-flash`, `gpt-4o`, `llama3.2`) or select **Custom Model ID...** to type in a custom model name (e.g. `mistral:latest`).
4. Click **Save Settings** to lock configurations strictly into local storage.

### 3. Generate Your First Agentic Config
1. Use the **Chat Assistant** panel on the left.
2. Select one of the quick start chips (e.g., *Farmer Advisor*, *FHIR Document Analyzer*, *Web Search Assistant*), or type a custom instruction:
   > *"I want an agent named ResearchAgent that uses gemini-2.0-flash and has the google_search tool. If the query requires writing code, it should transfer to a sub-agent named PythonDeveloper."*
3. The Chat Assistant will explain the architecture and write the YAML configuration.
4. Click **Apply Config** to load the generated agent tree directly into your Visual Designer and YAML Editor.

### 4. Visually Edit and Customize
*   Use the **Visual Editor** tab to adjust parameters:
    *   Change the default model provider or add Ollama/OpenAI keys.
    *   Add custom databases under the `Session` or `Memory` sections.
    *   Tweak agent instructions or toggle which tools are assigned to each agent.
*   Use the **YAML Editor** tab to see and copy the pristine framework-compatible output.

### 5. Export and Run with the Agentic CLI
Once your configuration is ready:
1. Click **Download Config** to save it as `agent.yaml`.
2. Move it to your local Agentic workspace:
   ```bash
   mv ~/Downloads/agent.yaml ../agentic/config/agent.yaml
   ```
3. Run it using the universal Go launcher:
   ```bash
   cd ../agentic
   ./agentic -console config/agent.yaml
   ```

---

## 📐 Framework Compatibility Matrix

VizEd maps directly to the Go Agentic framework capabilities:

| Feature | YAML Key | Description |
| :--- | :--- | :--- |
| **Root Entrypoint** | `root_agent` | Declares which agent handles the user's initial prompt. |
| **Models Registry** | `models` | Maps providers (`gemini`, `openai`, `ollama`, `ml`) to models. |
| **Custom Tools** | `tools` | Defines WASM plug-ins, Postgres/SQLite connections, Prolog systems, or standard API functions. |
| **Agent Nodes** | `agents` | Each agent gets a dedicated instruction, model, tools list, and sub-agents array. |
| **Agent Transfers** | `sub_agents` | Lists children. Framework automatically handles `transfer_to_agent`. |
| **Databases** | `session` & `memory` | Configures long-term conversation storage and user context. |
| **Security** | `auth` | Manages JWT public keys protecting production endpoints. |

---

## 🔒 Security & Privacy

VizEd respects your data above all:
*   **Zero Server Communication:** No third-party analytics, cloud storage, or backend APIs.
*   **Direct API Connections:** Queries are executed directly from your browser to the provider's official endpoint (e.g., Google Gemini, OpenAI, or your local Ollama port) with zero third-party logging or proxy sniffing.
*   **Clean Export:** Config YAMLs strip all localized UI settings and contain pure, production-ready framework definitions.
