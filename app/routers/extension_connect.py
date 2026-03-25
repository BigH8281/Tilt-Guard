from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse


router = APIRouter(tags=["extension-connect"])


@router.get("/extension/connect", response_class=HTMLResponse)
def extension_connect_page(extensionId: str = "", mode: str = "HOSTED") -> HTMLResponse:
    safe_extension_id = escape(extensionId)
    safe_mode = escape(mode.upper() or "HOSTED")
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tilt Guard Extension Connect</title>
    <style>
      :root {{
        color-scheme: dark;
        --bg: #081018;
        --panel: #101b24;
        --panel-border: #223240;
        --text: #edf5fb;
        --muted: #9bb0c2;
        --accent: #80d49b;
        --danger: #f08f8f;
      }}

      * {{
        box-sizing: border-box;
      }}

      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(128, 212, 155, 0.18), transparent 34%),
          linear-gradient(180deg, #081018 0%, #050b10 100%);
        color: var(--text);
        font: 15px/1.5 "Segoe UI", sans-serif;
      }}

      .shell {{
        width: min(100%, 460px);
        background: rgba(16, 27, 36, 0.94);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 22px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      }}

      h1 {{
        margin: 0 0 8px;
        font-size: 24px;
      }}

      p {{
        margin: 0 0 12px;
        color: var(--muted);
      }}

      .meta {{
        margin: 16px 0;
        padding: 12px;
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        background: rgba(8, 16, 24, 0.75);
      }}

      .meta strong {{
        display: block;
        color: var(--text);
        word-break: break-word;
      }}

      form {{
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }}

      label {{
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 13px;
      }}

      input {{
        width: 100%;
        border: 1px solid var(--panel-border);
        border-radius: 10px;
        padding: 11px 12px;
        background: #09131b;
        color: var(--text);
        font: inherit;
      }}

      button {{
        border: 0;
        border-radius: 10px;
        padding: 11px 12px;
        background: var(--accent);
        color: #081018;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }}

      button:disabled {{
        opacity: 0.7;
        cursor: default;
      }}

      .status {{
        margin-top: 14px;
        padding: 12px;
        border-radius: 12px;
        background: rgba(8, 16, 24, 0.75);
        border: 1px solid var(--panel-border);
        color: var(--muted);
        white-space: pre-wrap;
      }}

      .status.success {{
        border-color: rgba(128, 212, 155, 0.5);
        color: var(--text);
      }}

      .status.error {{
        border-color: rgba(240, 143, 143, 0.55);
        color: #ffd7d7;
      }}
    </style>
  </head>
  <body>
    <main class="shell">
      <h1>Connect your Tilt Guard extension</h1>
      <p>Sign in below to link this browser session to the extension.</p>

      <section class="meta">
        <p>Mode</p>
        <strong id="modeValue">{safe_mode}</strong>
        <p style="margin-top: 10px;">Extension ID</p>
        <strong id="extensionIdValue">{safe_extension_id or "Missing"}</strong>
      </section>

      <form id="loginForm">
        <label>
          Email
          <input id="emailInput" name="email" type="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input id="passwordInput" name="password" type="password" autocomplete="current-password" required />
        </label>
        <button id="submitButton" type="submit">Sign in and connect</button>
      </form>

      <div id="status" class="status">Checking for an existing signed-in session...</div>
    </main>

    <script>
      const TOKEN_STORAGE_KEY = "tilt-guard-token";
      const params = new URLSearchParams(window.location.search);
      const extensionId = params.get("extensionId") || "";
      const statusNode = document.querySelector("#status");
      const loginForm = document.querySelector("#loginForm");
      const submitButton = document.querySelector("#submitButton");

      function setStatus(message, variant = "") {{
        statusNode.textContent = message;
        statusNode.className = variant ? `status ${{variant}}` : "status";
      }}

      function setSubmitting(isSubmitting) {{
        submitButton.disabled = isSubmitting;
        submitButton.textContent = isSubmitting ? "Connecting..." : "Sign in and connect";
      }}

      async function requestJson(path, payload, token = "") {{
        const response = await fetch(path, {{
          method: payload ? "POST" : "GET",
          headers: {{
            ...(payload ? {{ "Content-Type": "application/json" }} : {{}}),
            ...(token ? {{ Authorization: `Bearer ${{token}}` }} : {{}}),
          }},
          ...(payload ? {{ body: JSON.stringify(payload) }} : {{}}),
        }});

        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json") ? await response.json() : await response.text();
        if (!response.ok) {{
          const detail = typeof body === "object" && body ? body.detail || "Request failed." : body || "Request failed.";
          throw new Error(Array.isArray(detail) ? detail.join(" ") : detail);
        }}

        return body;
      }}

      async function sendTokenToExtension(accessToken, email) {{
        if (!extensionId) {{
          throw new Error("Missing extension ID. Re-open this page from the extension popup.");
        }}

        if (!window.chrome?.runtime?.sendMessage) {{
          throw new Error("This browser cannot talk to the Tilt Guard extension.");
        }}

        return new Promise((resolve, reject) => {{
          window.chrome.runtime.sendMessage(
            extensionId,
            {{
              type: "tiltguard:auth-sync",
              payload: {{
                accessToken,
                userEmail: email,
              }},
            }},
            (response) => {{
              const runtimeError = window.chrome.runtime.lastError;
              if (runtimeError) {{
                reject(new Error(runtimeError.message));
                return;
              }}

              if (!response?.ok) {{
                reject(new Error(response?.error || "Extension auth sync failed."));
                return;
              }}

              resolve(response);
            }},
          );
        }});
      }}

      async function connectWithToken(accessToken) {{
        const me = await requestJson("/me", null, accessToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
        await sendTokenToExtension(accessToken, me.email);
        setStatus("Extension connected. You can return to TradingView and open the popup to confirm sync.", "success");
      }}

      async function bootstrapExistingSession() {{
        const existingToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!existingToken) {{
          setStatus("Sign in below to connect the extension.");
          return;
        }}

        try {{
          await connectWithToken(existingToken);
        }} catch (error) {{
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setStatus(error.message || "Stored sign-in session was not valid. Please sign in again.", "error");
        }}
      }}

      loginForm.addEventListener("submit", async (event) => {{
        event.preventDefault();
        setSubmitting(true);
        setStatus("Signing in and connecting the extension...");

        const formData = new FormData(loginForm);
        try {{
          const response = await requestJson("/login", {{
            email: String(formData.get("email") || "").trim(),
            password: String(formData.get("password") || ""),
          }});
          await sendTokenToExtension(response.access_token, response.user.email);
          localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
          setStatus("Extension connected. You can close this tab and return to TradingView.", "success");
        }} catch (error) {{
          setStatus(error.message || "Unable to connect the extension.", "error");
        }} finally {{
          setSubmitting(false);
        }}
      }});

      void bootstrapExistingSession();
    </script>
  </body>
</html>
"""
    return HTMLResponse(html)
