"use strict";
(() => {
  const form = document.querySelector("[data-invite-form]");
  if (!form) return;
  const message = document.querySelector("[data-invite-message]");
  const button = form.querySelector('button[type="submit"]');
  const installUrl = "https://discord.com/oauth2/authorize?client_id=1540731259544666132&permissions=1494917180630&integration_type=0&scope=bot%20applications.commands";
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const code = String(new FormData(form).get("code") || "").trim().toUpperCase();
    if (!code) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Checking invitation…";
    message.hidden = true;
    try {
      const response = await fetch("/api/invite/redeem", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn't verify that invitation.");
      message.textContent = "Code accepted. Opening Discord…";
      message.className = "portal-notice success";
      message.hidden = false;
      button.textContent = "Opening Discord…";
      window.location.assign(installUrl);
    } catch (error) {
      message.textContent = error.message;
      message.className = "portal-notice error";
      message.hidden = false;
      button.disabled = false;
      button.textContent = original;
    }
  });
})();