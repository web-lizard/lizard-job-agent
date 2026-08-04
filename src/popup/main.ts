import "../shared/theme.css";
import "./popup.css";

const root = document.getElementById("app");

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }

  if (typeof reason === "string") {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function showFatal(reason: unknown): void {
  const message = errorMessage(reason);
  console.error("[Lizard Job Agent] popup bootstrap failed", reason);

  if (!root) {
    return;
  }

  root.innerHTML = "";

  const panel = document.createElement("main");
  panel.style.cssText = [
    "min-width:360px",
    "min-height:440px",
    "padding:20px",
    "background:#111713",
    "color:#eef3e8",
    "font:14px/1.5 system-ui,sans-serif",
  ].join(";");

  const title = document.createElement("h1");
  title.textContent = "Lizard Job Agent не запустился";
  title.style.cssText = "margin:0 0 12px;font-size:19px;color:#c8ff79";

  const description = document.createElement("p");
  description.textContent =
    "Popup упал до запуска Vue. Ниже показана настоящая ошибка, а не зелёная пустота.";

  const output = document.createElement("pre");
  output.textContent = message;
  output.style.cssText = [
    "white-space:pre-wrap",
    "word-break:break-word",
    "padding:12px",
    "border:1px solid #6d3942",
    "border-radius:10px",
    "background:#25181b",
    "color:#ffbdc5",
    "font:12px/1.5 ui-monospace,Consolas,monospace",
  ].join(";");

  panel.append(title, description, output);
  root.append(panel);
}

window.addEventListener("error", (event) => {
  showFatal(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  showFatal(event.reason);
});

async function bootstrap(): Promise<void> {
  if (!root) {
    throw new Error('В popup.html отсутствует элемент <div id="app"></div>.');
  }

  const [{ createApp }, { default: App }] = await Promise.all([
    import("vue"),
    import("./App.vue"),
  ]);

  createApp(App).mount(root);
}

void bootstrap().catch(showFatal);
