/** Landing page (site/index.html): theme toggle, live prompt builder, copy buttons. */
import { copyButton, initThemeToggle } from "./common";

initThemeToggle();

const idea = document.getElementById("idea") as HTMLInputElement | null;
const slot = document.getElementById("idea-slot");
const prompt = document.getElementById("prompt-text");
const PLACEHOLDER = "<your idea>";
if (idea && slot) {
  const sync = () => {
    const v = idea.value.trim();
    slot.textContent = v || PLACEHOLDER;
    slot.classList.toggle("filled", !!v);
  };
  idea.addEventListener("input", sync);
  sync();
}
const copy = document.getElementById("copy-prompt");
if (copy && prompt) copyButton(copy, () => (prompt.textContent ?? "").replace(/\s+/g, " ").trim(), "Copied, paste it into your AI");
