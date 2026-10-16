/** Shared bits for the static GitHub Pages site: theme toggle and clipboard. */

export function initThemeToggle(): void {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme ?? (sysDark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage blocked */
    }
  });
}

/** Copy text; falls back to a hidden textarea where the async clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Wire a button to copy whatever getText() returns, with a short "Copied" confirmation. */
export function copyButton(btn: HTMLElement, getText: () => string, done = "Copied"): void {
  const label = btn.textContent ?? "Copy";
  btn.addEventListener("click", async () => {
    const ok = await copyText(getText());
    btn.textContent = ok ? done : "Copy failed";
    btn.classList.toggle("copied", ok);
    const live = document.getElementById("sr-status");
    if (live) live.textContent = ok ? done : "Copy failed";
    window.setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove("copied");
    }, 1600);
  });
}
