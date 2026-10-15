"use strict";
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }
  function notice(target, message, kind = "info") {
    if (!target) return;
    target.textContent = message;
    target.className = "portal-notice " + kind;
    target.hidden = false;
  }
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (cls) node.className = cls;
    return node;
  }
  function stat(label, value) {
    const box = el("div", null, "dashboard-stat");
    box.append(el("span", label), el("strong", value));
    return box;
  }
  function field(label, control) {
    const wrapper = el("label", label);
    wrapper.append(control);
    return wrapper;
  }

  const authForms = $$("[data-auth-form]");
  authForms.forEach(form => form.addEventListener("submit", async event => {
    event.preventDefault();
    const message = $("[data-form-message]", form);
    const data = Object.fromEntries(new FormData(form).entries());
    const action = form.dataset.authForm;
    const button = $('button[type="submit"]', form);
    if (button) { button.disabled = true; button.dataset.original = button.textContent; button.textContent = "One sec…"; }
    try {
      await api(action === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", body: JSON.stringify(data)
      });
      window.location.href = "dashboard.html";
    } catch (error) {
      notice(message, error.message, "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.original || "Continue"; }
    }
  }));

  const modeButtons = $$("[data-auth-mode]");
  modeButtons.forEach(button => button.addEventListener("click", () => {
    const mode = button.dataset.authMode;
    $("[data-auth-panel]").forEach(panel => {
      panel.hidden = panel.dataset.authPanel !== mode;
    });
    modeButtons.forEach(item => {
      item.classList.toggle("active", item === button || (
        item.closest(".portal-mode-switch") && item.dataset.authMode === mode
      ));
      if (item.getAttribute("role") === "tab") {
        item.setAttribute("aria-selected", String(item.dataset.authMode === mode));
      }
    });
    const activePanel = $("[data-auth-panel='" + mode + "']");
    const firstField = activePanel && $("input", activePanel);
    if (firstField && button.closest(".auth-switch-hint")) firstField.focus();
  }));

  const setupForm = $("[data-owner-setup]");
  if (setupForm) setupForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = $("[data-form-message]", setupForm);
    const button = $('button[type="submit"]', setupForm);
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(setupForm).entries());
      await api("/api/setup/owner", { method: "POST", body: JSON.stringify(data) });
      notice(message, "Owner account created! Remove OWNER_BOOTSTRAP_TOKEN from Blitz environment variables now. Opening your dashboard…", "success");
      setTimeout(() => window.location.href = "dashboard.html", 1800);
    } catch (error) { notice(message, error.message, "error"); }
    finally { button.disabled = false; }
  });

  const announcements = $("#live-announcements");
  if (announcements) {
    api("/api/announcements").then(data => {
      announcements.replaceChildren();
      if (!data.announcements.length) {
        announcements.append(el("article", null, "content-panel"));
        const empty = announcements.firstElementChild;
        empty.append(el("span", "NOTHING NEW JUST YET", "pill"), el("h2", "It's quiet… for now."), el("p", "Official announcements published by OKG staff will appear here."));
        return;
      }
      data.announcements.forEach(item => {
        const card = el("article", null, "content-panel");
        card.append(el("span", "OFFICIAL ANNOUNCEMENT", "pill"), el("h2", item.title), el("p", item.body));
        if (item.published_at) card.append(el("p", new Date(item.published_at).toLocaleDateString(), "portal-date"));
        announcements.append(card);
      });
    }).catch(() => {});
  }

  const dashboard = $("#live-dashboard");
  if (!dashboard) return;
  const status = $("[data-dashboard-message]");
  const logout = $("[data-logout]");
  if (logout) logout.addEventListener("click", async () => {
    const originalLabel = logout.textContent;
    logout.disabled = true;
    logout.textContent = "Signing out…";
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      window.location.href = "login.html";
    } catch (error) {
      notice(status, error.message, "error");
      logout.disabled = false;
      logout.textContent = originalLabel;
    }
  });

  function panel(title, description) {
    const node = el("section", null, "content-panel");
    node.append(el("h2", title), el("p", description));
    return node;
  }
  async function loadDashboard() {
    dashboard.setAttribute("aria-busy", "true");
    try {
      const data = await api("/api/dashboard/summary");
      dashboard.replaceChildren();
      const welcome = el("div", null, "dashboard-main-card");
      welcome.append(el("span", "SIGNED IN · " + data.user.role.toUpperCase(), "pill"),
        el("h2", "Hey, " + data.user.username + "! 👋"),
        el("p", "Your OKG home base is ready. Your available tools depend on your verified account role."));
      const stats = el("div", null, "dashboard-stats");
      stats.append(stat("Account role", data.user.role), stat("My support requests", data.member.mySupportRequests), stat("Open requests", data.member.openSupportRequests));
      welcome.append(stats);
      dashboard.append(welcome);

      const support = panel("💌 Need a hand?", "Send a support request. It will be saved to the staff queue so the team can follow up.");
      const form = el("form", null, "portal-form");
      form.dataset.supportForm = "true";
      const email = el("input"); email.type = "email"; email.name = "email"; email.required = true; email.maxLength = 254; email.placeholder = "Your email"; email.value = data.user.email;
      const subject = el("input"); subject.name = "subject"; subject.required = true; subject.minLength = 4; subject.maxLength = 160; subject.placeholder = "What's up?";
      const message = el("textarea"); message.name = "message"; message.required = true; message.minLength = 10; message.maxLength = 5000; message.rows = 4; message.placeholder = "Tell us a little more…";
      const send = el("button", "Send support request", "button button-primary"); send.type = "submit";
      const feedback = el("p", "", "portal-notice"); feedback.hidden = true;
      form.append(field("Reply email", email), field("Subject", subject), field("Message", message), send, feedback);
      form.addEventListener("submit", async event => {
        event.preventDefault(); send.disabled = true;
        try {
          const result = await api("/api/support/tickets", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
          notice(feedback, "Request #" + result.ticketId + " saved. Thanks for letting us know!", "success");
          form.reset(); email.value = data.user.email;
          loadDashboard();
        } catch (error) { notice(feedback, error.message, "error"); }
        finally { send.disabled = false; }
      });
      support.append(form); dashboard.append(support);

      if (data.staff) {
        const staff = panel("🛡️ Staff workspace", "Support requests assigned to the team. Update a ticket's status as you work it.");
        staff.append(el("div", "Open tickets: " + data.staff.openTickets, "pill"));
        const list = el("div", null, "portal-list");
        if (!data.staff.tickets.length) list.append(el("p", "No support requests yet."));
        data.staff.tickets.forEach(ticket => {
          const row = el("article", null, "portal-list-item");
          row.append(el("strong", "#" + ticket.id + " · " + ticket.subject), el("p", ticket.email + " · " + ticket.status), el("p", ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ""));
          const controls = el("div", null, "page-actions");
          ["open", "in_progress", "closed"].forEach(state => {
            const button = el("button", state.replace("_", " "), "button button-quiet"); button.type = "button";
            button.disabled = ticket.status === state;
            button.addEventListener("click", async () => {
              try { await api("/api/staff/tickets/" + ticket.id, { method: "PATCH", body: JSON.stringify({ status: state }) }); loadDashboard(); }
              catch (error) { notice(status, error.message, "error"); }
            });
            controls.append(button);
          });
          row.append(controls); list.append(row);
        });
        staff.append(list);
        const announceForm = el("form", null, "portal-form");
        announceForm.append(el("h3", "📣 Draft an announcement"));
        const title = el("input"); title.name = "title"; title.required = true; title.minLength = 4; title.maxLength = 180; title.placeholder = "Announcement title";
        const body = el("textarea"); body.name = "body"; body.required = true; body.minLength = 10; body.maxLength = 10000; body.rows = 4; body.placeholder = "Write the announcement…";
        const publish = el("button", data.user.role === "owner" ? "Publish announcement" : "Save draft for owner review", "button button-primary"); publish.type = "submit";
        const feedback = el("p", "", "portal-notice"); feedback.hidden = true;
        announceForm.append(field("Announcement title", title), field("Announcement text", body), publish, feedback);
        announceForm.addEventListener("submit", async event => {
          event.preventDefault(); publish.disabled = true;
          try {
            const result = await api("/api/staff/announcements", { method: "POST", body: JSON.stringify({ ...Object.fromEntries(new FormData(announceForm).entries()), status: data.user.role === "owner" ? "published" : "draft" }) });
            notice(feedback, result.status === "published" ? "Announcement published!" : "Draft saved for owner review.", "success");
            announceForm.reset();
          } catch (error) { notice(feedback, error.message, "error"); }
          finally { publish.disabled = false; }
        });
        staff.append(announceForm); dashboard.append(staff);
      }

      if (data.owner) {
        const owner = panel("👑 Owner control room", "Manage account roles and review recent platform activity. Owner permissions are checked by the server.");
        const metrics = el("div", null, "dashboard-stats");
        metrics.append(stat("Total accounts", data.owner.totalUsers), stat("Staff members", data.owner.staffMembers), stat("Audit events · 7 days", data.owner.auditEventsLast7Days));
        owner.append(metrics, el("h3", "Account access"));
        const tableWrap = el("div", null, "portal-table-wrap");
        const table = el("table", null, "portal-table");
        const head = el("tr"); ["User", "Email", "Role", "Change role"].forEach(value => head.append(el("th", value)));
        const thead = el("thead"); thead.append(head); table.append(thead);
        const tbody = el("tbody");
        data.owner.users.forEach(user => {
          const row = el("tr");
          row.append(el("td", user.username), el("td", user.email), el("td", user.role));
          const cell = el("td");
          if (user.role === "owner") cell.textContent = "Protected";
          else {
            const select = el("select"); ["member", "staff"].forEach(role => { const option = el("option", role); option.value = role; option.selected = user.role === role; select.append(option); });
            const button = el("button", "Save", "button button-quiet"); button.type = "button";
            button.addEventListener("click", async () => {
              button.disabled = true;
              try { await api("/api/owner/users/" + user.id + "/role", { method: "PATCH", body: JSON.stringify({ role: select.value }) }); await loadDashboard(); }
              catch (error) { notice(status, error.message, "error"); }
              finally { button.disabled = false; }
            });
            cell.append(select, button);
          }
          row.append(cell); tbody.append(row);
        });
        table.append(tbody); tableWrap.append(table); owner.append(tableWrap, el("h3", "Recent security events"));
        const logs = el("div", null, "portal-list");
        data.owner.recentAudit.forEach(log => logs.append(el("p", new Date(log.created_at).toLocaleString() + " · " + log.action + " · user " + (log.actor_id || "system"))));
        owner.append(logs); dashboard.append(owner);
      }
      dashboard.append(el("p", "Signed in as " + data.user.email + ". Keep your password private.", "portal-muted"));
      dashboard.setAttribute("aria-busy", "false");
    } catch (error) {
      dashboard.setAttribute("aria-busy", "false");
      if (error.message.toLowerCase().includes("sign in")) { window.location.href = "login.html"; return; }
      notice(status, error.message, "error");
    }
  }
  loadDashboard();
})();