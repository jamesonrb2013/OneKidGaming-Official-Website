(() => {
  const SITE_VERSION = "1.2.0";

  // Keep a visible version marker on every page using the shared script.
  const footerBottom = document.querySelector(".footer-bottom");
  if (footerBottom && !footerBottom.querySelector(".site-version")) {
    const version = document.createElement("span");
    version.className = "site-version";
    version.textContent = "OKG WEB v" + SITE_VERSION;
    version.setAttribute("aria-label", "OneKidGaming website version " + SITE_VERSION);
    footerBottom.prepend(version);
  }

  // The homepage news ribbon uses published announcements from the live API.
  const announcementTitle = document.querySelector("#home-announcement-title");
  if (announcementTitle) {
    fetch("/api/announcements", { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error("Announcements unavailable");
        return response.json();
      })
      .then((data) => {
        const latest = Array.isArray(data.announcements) ? data.announcements[0] : null;
        announcementTitle.textContent = latest && typeof latest.title === "string"
          ? latest.title
          : "Fresh ideas are in the works.";
      })
      .catch(() => {
        announcementTitle.textContent = "Find the latest from our community.";
      });
  }
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation");
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation");
      }
    });
  }

  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();

  const revealItems = document.querySelectorAll(
    ".intro-content, .project-card, .hub-card, .manifesto-heading, .principle, .join-panel, .content-panel, .staff-card"
  );

  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealItems.forEach((item) => item.classList.add("fade-in"));
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  }
})();