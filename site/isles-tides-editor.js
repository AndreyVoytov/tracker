(function () {
  "use strict";

  const fields = [
    { key: "event_id", label: "event_id", type: "text", width: 150 },
    { key: "sort_order", label: "sort_order", type: "number", width: 75 },
    { key: "route_id", label: "route_id", type: "text", width: 115 },
    { key: "route_visit", label: "route_visit", type: "number", width: 85 },
    { key: "title", label: "title", type: "text", width: 205 },
    { key: "narrative", label: "narrative", type: "textarea", width: 330 },
    { key: "choice_a_label", label: "choice_a_label", type: "text", width: 180 },
    { key: "choice_a_effect", label: "choice_a_effect", type: "textarea", width: 250 },
    { key: "choice_a_wood", label: "choice_a_wood", type: "number", width: 90 },
    { key: "choice_a_stone", label: "choice_a_stone", type: "number", width: 90 },
    { key: "choice_a_berries", label: "choice_a_berries", type: "number", width: 100 },
    { key: "choice_a_shells", label: "choice_a_shells", type: "number", width: 90 },
    { key: "choice_b_label", label: "choice_b_label", type: "text", width: 180 },
    { key: "choice_b_effect", label: "choice_b_effect", type: "textarea", width: 250 },
    { key: "choice_b_wood", label: "choice_b_wood", type: "number", width: 90 },
    { key: "choice_b_stone", label: "choice_b_stone", type: "number", width: 90 },
    { key: "choice_b_berries", label: "choice_b_berries", type: "number", width: 100 },
    { key: "choice_b_shells", label: "choice_b_shells", type: "number", width: 90 },
    { key: "enabled", label: "enabled", type: "checkbox", width: 75 }
  ];
  const rows = [];
  let originalIds = new Set();
  let database = null;

  const $ = (selector) => document.querySelector(selector);
  const statusNode = $("#editor-status");
  const errorNode = $("#editor-error");
  const bodyNode = $("#story-body");

  function setStatus(message, tone = "muted") {
    statusNode.textContent = message;
    statusNode.dataset.tone = tone;
  }

  function showError(message) {
    errorNode.textContent = message;
    errorNode.hidden = false;
  }

  function clearError() {
    errorNode.textContent = "";
    errorNode.hidden = true;
  }

  function makeDefaultRow(index) {
    return {
      event_id: `new-event-${Date.now()}-${index}`,
      sort_order: (index + 1) * 10,
      route_id: "lagoon",
      route_visit: 1,
      title: "Новый сюжетный поворот",
      narrative: "",
      choice_a_label: "Выбор A",
      choice_a_effect: "",
      choice_a_wood: 0,
      choice_a_stone: 0,
      choice_a_berries: 0,
      choice_a_shells: 0,
      choice_b_label: "Выбор B",
      choice_b_effect: "",
      choice_b_wood: 0,
      choice_b_stone: 0,
      choice_b_berries: 0,
      choice_b_shells: 0,
      enabled: true
    };
  }

  function renderHead() {
    const row = document.createElement("tr");
    fields.forEach((field) => {
      const cell = document.createElement("th");
      cell.textContent = field.label;
      cell.style.width = `${field.width}px`;
      row.appendChild(cell);
    });
    const actions = document.createElement("th");
    actions.textContent = "строка";
    actions.style.width = "75px";
    row.appendChild(actions);
    $("#story-head").replaceChildren(row);
  }

  function renderRows() {
    bodyNode.replaceChildren();
    rows.forEach((data, index) => {
      const row = document.createElement("tr");
      fields.forEach((field) => {
        const cell = document.createElement("td");
        const control = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
        if (field.type === "checkbox") {
          control.type = "checkbox";
          control.checked = data[field.key] !== false;
          control.className = "story-cell-checkbox";
          const wrap = document.createElement("label");
          wrap.className = "story-enabled-cell";
          wrap.appendChild(control);
          cell.appendChild(wrap);
        } else {
          control.className = "story-cell";
          control.value = data[field.key] == null ? "" : String(data[field.key]);
          if (field.type === "number") {
            control.type = "number";
            control.step = "1";
            control.min = field.key.startsWith("choice_") ? "-99" : "0";
            control.max = field.key.startsWith("choice_") ? "99" : "999";
          }
          control.setAttribute("aria-label", field.label);
          cell.appendChild(control);
        }
        control.addEventListener("input", () => {
          data[field.key] = field.type === "number" ? Number(control.value || 0) : field.type === "checkbox" ? control.checked : control.value;
        });
        control.addEventListener("change", () => {
          data[field.key] = field.type === "number" ? Number(control.value || 0) : field.type === "checkbox" ? control.checked : control.value;
        });
        row.appendChild(cell);
      });
      const actionCell = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "story-delete";
      remove.textContent = "Удалить";
      remove.addEventListener("click", () => {
        rows.splice(index, 1);
        renderRows();
      });
      actionCell.appendChild(remove);
      row.appendChild(actionCell);
      bodyNode.appendChild(row);
    });
  }

  function setButtonsEnabled(enabled) {
    ["#save-events", "#add-event", "#copy-tsv", "#download-tsv", "#download-json", "#upload-tsv"].forEach((selector) => {
      $(selector).disabled = !enabled;
    });
  }

  async function loadRows() {
    const result = await database.from("isles_story_turns").select("*").order("sort_order", { ascending: true }).order("route_visit", { ascending: true });
    if (result.error) throw result.error;
    rows.splice(0, rows.length, ...(result.data || []).map((row) => ({ ...row })));
    originalIds = new Set(rows.map((row) => row.event_id));
    renderRows();
  }

  function cleanRows() {
    return rows.map((row) => {
      const clean = {};
      fields.forEach((field) => {
        clean[field.key] = field.type === "number" ? Math.floor(Number(row[field.key]) || 0) : field.type === "checkbox" ? row[field.key] !== false : String(row[field.key] || "").trim();
      });
      clean.updated_at = new Date().toISOString();
      return clean;
    });
  }

  async function saveRows() {
    clearError();
    const payload = cleanRows();
    const missing = payload.find((row) => !row.event_id || !row.route_id || !row.title || !row.choice_a_label || !row.choice_b_label);
    if (missing) {
      showError("Для каждой строки нужны event_id, route_id, title и оба названия выбора.");
      return;
    }
    const routeVisits = new Set();
    const duplicateVisit = payload.find((row) => {
      const key = `${row.route_id}:${row.route_visit}`;
      if (routeVisits.has(key)) return true;
      routeVisits.add(key);
      return false;
    });
    if (duplicateVisit) {
      showError(`Для маршрута ${duplicateVisit.route_id} номер рейса ${duplicateVisit.route_visit} уже занят.`);
      return;
    }
    const currentIds = new Set(payload.map((row) => row.event_id));
    const deleted = [...originalIds].filter((id) => !currentIds.has(id));
    const button = $("#save-events");
    button.disabled = true;
    try {
      if (deleted.length) {
        const removal = await database.from("isles_story_turns").delete().in("event_id", deleted);
        if (removal.error) throw removal.error;
      }
      if (payload.length) {
        const saved = await database.from("isles_story_turns").upsert(payload, { onConflict: "event_id" });
        if (saved.error) throw saved.error;
      }
      originalIds = new Set(payload.map((row) => row.event_id));
      setStatus(`Сохранено событий: ${payload.length} · игра загрузит их из базы`, "good");
      clearError();
    } catch (error) {
      showError(`Не удалось сохранить таблицу: ${error.message || error}. Проверьте SQL-схему и права владельца.`);
      setStatus("Ошибка сохранения", "bad");
    } finally {
      button.disabled = false;
    }
  }

  function toTsv(sourceRows = rows) {
    const lines = [fields.map((field) => field.key).join("\t")];
    sourceRows.forEach((row) => {
      lines.push(fields.map((field) => {
        const value = field.type === "checkbox" ? (row[field.key] !== false ? "true" : "false") : String(row[field.key] ?? "");
        return value.replace(/[\t\r\n]+/g, " ");
      }).join("\t"));
    });
    return lines.join("\n");
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function copyTsv() {
    try {
      await navigator.clipboard.writeText(toTsv());
      setStatus("Таблица скопирована. Вставьте её в Google Sheets с ячейки A1.", "good");
    } catch (error) {
      showError("Браузер запретил буфер обмена. Скачайте TSV и импортируйте его в Google Sheets.");
    }
  }

  async function importTsv(file) {
    const content = await file.text();
    const [headerLine, ...dataLines] = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length);
    if (!headerLine) throw new Error("TSV-файл пуст.");
    const headers = headerLine.split("\t").map((item) => item.trim());
    const missing = fields.filter((field) => !headers.includes(field.key));
    if (missing.length) throw new Error(`Не хватает колонок: ${missing.map((field) => field.key).join(", ")}`);
    const imported = dataLines.map((line) => {
      const cells = line.split("\t");
      const row = makeDefaultRow(rows.length);
      fields.forEach((field) => {
        const value = cells[headers.indexOf(field.key)] ?? "";
        row[field.key] = field.type === "number" ? Number(value) || 0 : field.type === "checkbox" ? value.toLowerCase() !== "false" : value;
      });
      return row;
    });
    rows.splice(0, rows.length, ...imported);
    renderRows();
    setStatus(`Загружено строк из TSV: ${rows.length}. Нажмите «Сохранить изменения».`, "good");
  }

  async function initialize() {
    renderHead();
    setButtonsEnabled(false);
    const config = window.TRACKER_SUPABASE_CONFIG;
    if (!config || !window.supabase) {
      setStatus("Supabase SDK недоступен", "bad");
      showError("Обновите страницу и проверьте подключение к Supabase.");
      return;
    }
    database = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    try {
      await loadRows();
      setButtonsEnabled(true);
      setStatus(`База подключена · строк: ${rows.length}`, "good");
    } catch (error) {
      setStatus("Не найдена таблица сюжетных событий", "bad");
      showError("Выполните файл supabase/isles-story-turns.sql в SQL Editor проекта Supabase, затем обновите эту страницу.");
    }
  }

  $("#save-events").addEventListener("click", saveRows);
  $("#add-event").addEventListener("click", () => {
    rows.push(makeDefaultRow(rows.length));
    renderRows();
    const scroller = $("#table-scroll");
    scroller.scrollTop = scroller.scrollHeight;
    scroller.scrollLeft = scroller.scrollWidth;
  });
  $("#copy-tsv").addEventListener("click", copyTsv);
  $("#download-tsv").addEventListener("click", () => download("isles-of-the-tides-story.tsv", toTsv(), "text/tab-separated-values;charset=utf-8"));
  $("#download-json").addEventListener("click", () => {
    const config = { version: 1, project: "isles-of-the-tides", storyTurns: cleanRows().map(({ updated_at, ...row }) => row) };
    download("isles-of-the-tides-config.json", JSON.stringify(config, null, 2), "application/json;charset=utf-8");
  });
  $("#upload-tsv").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      await importTsv(file);
      clearError();
    } catch (error) {
      showError(error.message || "Не удалось импортировать TSV.");
    }
    event.target.value = "";
  });

  initialize();
})();
