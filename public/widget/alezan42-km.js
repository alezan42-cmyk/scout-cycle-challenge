/*!
 * Widget « Défi kilomètres ALEZAN 42 » — à intégrer sur un autre site.
 *
 *   <div data-alezan42-km data-sections="total,patrouilles,scouts" data-period="semaine"></div>
 *   <script src="https://alezan42-cycling.pages.dev/widget/alezan42-km.js" defer></script>
 *
 * Options (attributs facultatifs) :
 *   data-sections : total, patrouilles, scouts (séparés par des virgules) — défaut « total,patrouilles »
 *   data-period   : semaine | mois | tout — défaut « semaine »
 *   data-limit    : nombre de lignes par classement — défaut 5
 *   data-theme    : clair | sombre — défaut « clair »
 *   data-titre    : titre affiché — défaut « Défi kilomètres ALEZAN 42 »
 *
 * Données : uniquement les vues publiques (mêmes informations que le site pour un visiteur
 * sans compte : km validés, patrouilles, totem ou prénom abrégé). Aucun cookie.
 */
(function () {
  "use strict";
  var SUPABASE_URL = "https://civblymnwigeayfecujp.supabase.co";
  var KEY = "sb_publishable_Rs7_eLIv_g7FcK2R1Hz8cw_rc6qLJfs";
  var SITE = "https://alezan42-cycling.pages.dev";
  var CACHE_MS = 5 * 60 * 1000;

  var nf = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });
  var dataPromise = null;

  function api(path) {
    return fetch(SUPABASE_URL + "/rest/v1/" + path, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY },
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    try {
      var cached = JSON.parse(sessionStorage.getItem("alezan42-km") || "null");
      if (cached && Date.now() - cached.t < CACHE_MS) {
        dataPromise = Promise.resolve(cached.d);
        return dataPromise;
      }
    } catch (e) {
      /* stockage indisponible */
    }
    dataPromise = Promise.all([
      api("profiles_public?select=id,full_name,totem,patrol_id,is_admin"),
      api("activities_public?select=user_id,km,ride_date&status=eq.approved"),
      api("patrols?select=id,name,category"),
    ]).then(function (res) {
      var d = { profiles: res[0], activities: res[1], patrols: res[2] };
      try {
        sessionStorage.setItem("alezan42-km", JSON.stringify({ t: Date.now(), d: d }));
      } catch (e) {
        /* ignore */
      }
      return d;
    });
    return dataPromise;
  }

  function iso(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function range(period) {
    var now = new Date();
    if (period === "mois") {
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        label: "ce mois-ci",
      };
    }
    if (period === "tout") return { from: null, to: null, label: "depuis le début" };
    var day = (now.getDay() + 6) % 7;
    var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    var sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return { from: iso(mon), to: iso(sun), label: "cette semaine" };
  }

  function isStaffPatrol(p) {
    if (!p) return false;
    if (p.category === "staff") return true;
    var n = (p.name || "").toLowerCase();
    return n.indexOf("staff") >= 0 || n.indexOf("chef") >= 0;
  }

  function compute(d, period) {
    var r = range(period);
    var patrolById = {};
    d.patrols.forEach(function (p) {
      patrolById[p.id] = p;
    });
    var kmByUser = {};
    var total = 0;
    d.activities.forEach(function (a) {
      if (r.from && (a.ride_date < r.from || a.ride_date > r.to)) return;
      var km = Number(a.km) || 0;
      kmByUser[a.user_id] = (kmByUser[a.user_id] || 0) + km;
      total += km;
    });
    var mainStaff =
      d.patrols.filter(function (p) {
        var n = (p.name || "").trim().toLowerCase();
        return n === "staff troupe" || n === "staff";
      })[0] || null;

    var scouts = [];
    var patrolKm = {};
    d.profiles.forEach(function (p) {
      var km = kmByUser[p.id] || 0;
      var patrol = patrolById[p.patrol_id] || null;
      var staff = isStaffPatrol(patrol) || (!patrol && !!p.is_admin);
      var pid = patrol ? patrol.id : staff && mainStaff ? mainStaff.id : null;
      if (pid) patrolKm[pid] = (patrolKm[pid] || 0) + km;
      if (!staff && km > 0) {
        scouts.push({
          name: p.totem || p.full_name || "Scout",
          sub: patrol ? patrol.name : "",
          km: km,
        });
      }
    });
    var patrols = d.patrols
      .map(function (p) {
        return { name: p.name, sub: isStaffPatrol(p) ? "Staff" : "", km: patrolKm[p.id] || 0 };
      })
      .filter(function (p) {
        return p.km > 0;
      });
    var byKm = function (a, b) {
      return b.km - a.km || a.name.localeCompare(b.name);
    };
    return { total: total, label: r.label, patrols: patrols.sort(byKm), scouts: scouts.sort(byKm) };
  }

  var CSS =
    ":host{all:initial;display:block}" +
    ".w{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--fg);background:var(--bg);border:1px solid var(--bd);border-radius:20px;padding:20px;width:100%;box-sizing:border-box;line-height:1.35}" +
    ".w *{box-sizing:border-box}" +
    ".clair{--bg:#fffaf3;--fg:#2b1d12;--mu:#7a6250;--bd:#ecdcc8;--ac:#e8782a;--row:#f6ecdf}" +
    ".sombre{--bg:#1d1814;--fg:#f6eadb;--mu:#bba48f;--bd:#3a2f26;--ac:#f08a3c;--row:#2a221c}" +
    ".hd{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}" +
    ".t{font-weight:800;font-size:17px;margin:0}" +
    ".p{font-size:13px;color:var(--mu);margin:2px 0 0}" +
    ".tot{background:var(--ac);color:#fff;border-radius:16px;padding:14px 16px;margin:0 0 16px}" +
    ".tot b{display:block;font-size:30px;font-weight:900;letter-spacing:-.02em}" +
    ".tot span{font-size:13px;opacity:.9}" +
    "h4{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu);margin:16px 0 8px}" +
    "ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}" +
    "li{display:flex;align-items:center;gap:10px;background:var(--row);border-radius:12px;padding:9px 12px}" +
    ".r{width:22px;text-align:center;font-weight:800;color:var(--mu)}" +
    ".n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}" +
    ".n small{display:block;font-weight:400;font-size:12px;color:var(--mu)}" +
    ".k{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".e{font-size:14px;color:var(--mu);padding:6px 2px}" +
    "a.l{display:inline-block;margin-top:14px;color:var(--ac);font-weight:700;font-size:14px;text-decoration:none}" +
    "a.l:hover{text-decoration:underline}" +
    ".cols{display:grid;gap:0 20px}" +
    // Petit espace (téléphone, colonne étroite) : plus compact
    ".sz-s{padding:14px;border-radius:16px}" +
    ".sz-s .t{font-size:15px}" +
    ".sz-s .tot{padding:12px 14px;margin-bottom:12px}" +
    ".sz-s .tot b{font-size:24px}" +
    ".sz-s li{padding:8px 10px;gap:8px}" +
    ".sz-s .n{font-size:14px}" +
    ".sz-s .k{font-size:14px}" +
    // Grand espace (ordinateur) : total à gauche, classements côte à côte
    ".sz-l{padding:26px}" +
    ".sz-l .t{font-size:20px}" +
    ".sz-l .tot b{font-size:38px}" +
    ".sz-l .cols.two{grid-template-columns:1fr 1fr}" +
    ".sz-l .cols h4{margin-top:4px}" +
    ".sz-xl .body{display:grid;grid-template-columns:minmax(200px,1fr) 3fr;gap:24px;align-items:start}" +
    ".sz-xl .tot{margin:0}";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var MEDALS = ["🥇", "🥈", "🥉"];
  function list(rows, limit) {
    if (!rows.length) return '<p class="e">Pas encore de km sur cette période.</p>';
    return (
      "<ol>" +
      rows
        .slice(0, limit)
        .map(function (r, i) {
          return (
            '<li><span class="r">' +
            (i < 3 ? MEDALS[i] : i + 1) +
            '</span><span class="n">' +
            esc(r.name) +
            (r.sub ? "<small>" + esc(r.sub) + "</small>" : "") +
            '</span><span class="k">' +
            nf.format(r.km) +
            " km</span></li>"
          );
        })
        .join("") +
      "</ol>"
    );
  }

  function render(el) {
    if (el.__alezan42) return;
    el.__alezan42 = true;
    var sections = (el.getAttribute("data-sections") || "total,patrouilles")
      .toLowerCase()
      .split(",")
      .map(function (s) {
        return s.trim();
      });
    var period = (el.getAttribute("data-period") || "semaine").toLowerCase();
    var limit = Math.max(1, Math.min(20, parseInt(el.getAttribute("data-limit") || "5", 10) || 5));
    var theme = el.getAttribute("data-theme") === "sombre" ? "sombre" : "clair";
    var title = el.getAttribute("data-titre") || "Défi kilomètres ALEZAN 42";

    var root = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
    // Taille du bloc sur la page hôte (et pas seulement de l'écran) : s < 420 px ≤ m < 640 px ≤ l < 900 px ≤ xl
    var sizeOf = function (w) {
      return w < 420 ? "sz-s" : w < 640 ? "sz-m" : w < 900 ? "sz-l" : "sz-l sz-xl";
    };
    var size = sizeOf(el.getBoundingClientRect().width || 360);
    var box = function (inner) {
      root.innerHTML =
        "<style>" + CSS + '</style><div class="w ' + theme + " " + size + '">' + inner + "</div>";
    };
    if (window.ResizeObserver) {
      new ResizeObserver(function (entries) {
        var next = sizeOf(entries[0].contentRect.width);
        if (next === size) return;
        size = next;
        var w = root.querySelector(".w");
        if (w) w.className = "w " + theme + " " + size;
      }).observe(el);
    }
    box('<p class="e">Chargement du classement…</p>');

    loadData()
      .then(function (d) {
        var c = compute(d, period);
        var html =
          '<div class="hd"><div><p class="t">' +
          esc(title) +
          '</p><p class="p">Vélo, course et marche · ' +
          c.label +
          "</p></div></div>";
        var lists = [];
        if (sections.indexOf("patrouilles") >= 0)
          lists.push("<div><h4>Patrouilles</h4>" + list(c.patrols, limit) + "</div>");
        if (sections.indexOf("scouts") >= 0)
          lists.push("<div><h4>Scouts</h4>" + list(c.scouts, limit) + "</div>");
        html += '<div class="body">';
        if (sections.indexOf("total") >= 0) {
          html +=
            '<div class="tot"><b>' +
            nf.format(c.total) +
            " km</b><span>parcourus par la troupe " +
            c.label +
            "</span></div>";
        }
        html +=
          '<div class="cols' +
          (lists.length > 1 ? " two" : "") +
          '">' +
          lists.join("") +
          "</div></div>";
        html +=
          '<a class="l" href="' +
          SITE +
          '" target="_blank" rel="noopener">Voir le classement complet →</a>';
        box(html);
      })
      .catch(function () {
        box(
          '<p class="e">Classement momentanément indisponible.</p><a class="l" href="' +
            SITE +
            '" target="_blank" rel="noopener">Ouvrir le site du défi →</a>',
        );
      });
  }

  function init() {
    var els = document.querySelectorAll("[data-alezan42-km]");
    for (var i = 0; i < els.length; i++) render(els[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // Pages construites après coup (constructeurs de sites) : on surveille l'arrivée du bloc
  if (window.MutationObserver) {
    new MutationObserver(init).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
