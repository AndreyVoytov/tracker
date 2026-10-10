(function () {
  "use strict";

  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const projects = Array.isArray(window.TRACKER_PROJECTS) ? window.TRACKER_PROJECTS : [];
  const state = {
    db: null,
    session: null,
    isOwner: false,
    currentFilter: "all",
    currentProject: null,
    taskRows: [],
    progress: Object.create(null),
    databaseError: "",
    toastTimer: null
  };

  const grid = $("#project-grid");
  const projectDialog = $("#project-dialog");
  const detailRoot = $("#project-detail");
  const loginDialog = $("#login-dialog");
  const toast = $("#toast");

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function setCloudStatus(message, tone) {
    const box = $("#cloud-state");
    box.dataset.tone = tone || "muted";
    $("#cloud-state-text").textContent = message;
  }

  function readinessFor(project) {
    return Number.isInteger(state.progress[project.id])
      ? state.progress[project.id]
      : project.readiness;
  }

  function activeTasksFor(projectId) {
    return state.taskRows.filter(function (task) {
      return task.project_id === projectId && !task.completed;
    }).length;
  }

  function showToast(message, tone) {
    toast.textContent = message;
    toast.dataset.tone = tone || "good";
    toast.classList.add("visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      toast.classList.remove("visible");
    }, 2800);
  }

  function updateMetrics() {
    const average = projects.length
      ? Math.round(projects.reduce(function (sum, project) {
          return sum + readinessFor(project);
        }, 0) / projects.length)
      : 0;
    $("#metric-count").textContent = String(projects.length);
    $("#active-projects").textContent = String(projects.filter(function (project) {
      return project.stage !== "Выложена";
    }).length);
    $("#metric-average").innerHTML = average + "<em>%</em>";
    if (state.isOwner) {
      const openCount = state.taskRows.filter(function (task) { return !task.completed; }).length;
      $("#metric-tasks").textContent = String(openCount);
      $("#metric-tasks-caption").textContent = "по всем проектам";
    } else {
      $("#metric-tasks").textContent = "—";
      $("#metric-tasks-caption").textContent = "войдите, чтобы увидеть задачи";
    }
  }

  function projectMatches(project, query) {
    const text = [project.title, project.folder, project.genre, project.description].join(" ").toLocaleLowerCase("ru");
    if (query && !text.includes(query)) return false;
    if (state.currentFilter === "Web") return project.platforms.includes("Web");
    if (state.currentFilter === "Mobile") {
      return project.platforms.some(function (platform) {
        return platform === "Mobile" || platform === "Android" || platform === "iOS";
      });
    }
    if (state.currentFilter === "early") return readinessFor(project) < 40;
    return true;
  }

  function sortedProjects(list) {
    const sort = $("#sort-select").value;
    return list.sort(function (a, b) {
      if (sort === "readiness-asc") return readinessFor(a) - readinessFor(b);
      if (sort === "name-asc") return a.title.localeCompare(b.title, "ru");
      if (sort === "tasks-desc") return activeTasksFor(b.id) - activeTasksFor(a.id);
      return readinessFor(b) - readinessFor(a);
    });
  }

  function makeProjectCard(project) {
    const card = node("article", "project-card");
    const open = node("button", "project-open");
    open.type = "button";
    open.setAttribute("aria-label", "Открыть проект " + project.title);
    open.addEventListener("click", function () { openProject(project.id); });

    const art = node("div", "project-art");
    const image = node("img");
    image.src = project.icon;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    art.append(image, node("span", "card-stage", project.stage), node("span", "card-arrow", "↗"));

    const content = node("div", "card-content");
    const meta = node("div", "card-meta");
    meta.appendChild(node("span", "genre-label", project.genre));
    const tags = node("span", "platform-tags");
    project.platforms.slice(0, 2).forEach(function (platform) {
      tags.appendChild(node("span", "platform-tag", platform));
    });
    meta.appendChild(tags);

    const title = node("h3", "", project.title);
    const description = node("p", "", project.description);
    const row = node("div", "readiness-row");
    const left = node("span", "readiness-label", "ГОТОВНОСТЬ ГЕЙМПЛЕЯ");
    const value = node("strong", "readiness-value", readinessFor(project) + "%");
    row.append(left, value);
    const track = node("div", "readiness-track");
    const fill = node("div", "readiness-fill");
    fill.style.width = readinessFor(project) + "%";
    track.appendChild(fill);

    const taskLabel = state.isOwner
      ? (activeTasksFor(project.id) + " открытых задач")
      : "Открыть карточку";
    const task = node("div", "task-mini", taskLabel);
    content.append(meta, title, description, row, track, task);
    open.append(art, content);
    card.appendChild(open);
    return card;
  }

  function renderProjects() {
    const query = $("#search-input").value.trim().toLocaleLowerCase("ru");
    const visible = sortedProjects(projects.filter(function (project) {
      return projectMatches(project, query);
    }));
    grid.replaceChildren();
    visible.forEach(function (project) { grid.appendChild(makeProjectCard(project)); });
    $("#visible-count").textContent = String(visible.length);
    $("#empty-state").hidden = visible.length !== 0;
    updateMetrics();
  }

  function openProject(projectId) {
    const project = projects.find(function (item) { return item.id === projectId; });
    if (!project) return;
    state.currentProject = project;
    renderProjectDetail();
    if (!projectDialog.open) projectDialog.showModal();
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.id);
    window.history.replaceState({}, "", url);
  }

  function addDetailChip(container, text) {
    container.appendChild(node("span", "detail-chip", text));
  }

  function renderReadinessEditor(project) {
    const panel = node("section", "readiness-editor");
    panel.appendChild(node("h3", "", "Готовность геймплея"));
    panel.appendChild(node("p", "", "Оценка по текущей сборке и материалам проекта. Задачи на неё не влияют."));
    const slider = node("input", "readiness-slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(readinessFor(project));
    slider.disabled = !state.isOwner;
    const sliderLabels = node("div", "slider-labels");
    sliderLabels.append(node("span", "", "Черновик"), node("span", "", "Готово"));
    const editorNote = node("div", "editor-note");
    editorNote.appendChild(node("strong", "", state.isOwner ? "Изменения синхронизируются с базой." : "Войдите, чтобы менять оценку."));
    slider.addEventListener("input", function () {
      const number = $(".detail-readiness strong");
      if (number) number.textContent = slider.value + "%";
    });
    slider.addEventListener("change", function () {
      if (state.isOwner) saveReadiness(project, Number(slider.value));
    });
    panel.append(slider, sliderLabels, editorNote);
    return panel;
  }

  function renderTasksPanel(project) {
    const panel = node("section", "tasks-panel");
    const heading = node("div", "tasks-heading");
    heading.appendChild(node("h3", "", "Задачи"));
    const projectTasks = state.taskRows.filter(function (task) { return task.project_id === project.id; });
    const openCount = projectTasks.filter(function (task) { return !task.completed; }).length;
    heading.appendChild(node("span", "tasks-count", projectTasks.length + " всего · " + openCount + " открыто"));
    panel.appendChild(heading);

    if (!state.isOwner) {
      const prompt = node("div", "login-task-prompt");
      const message = state.session
        ? "У этой учётной записи нет доступа владельца. Войдите аккаунтом из каталога механик."
        : "Задачи и их изменения доступны владельцу после входа по одноразовой ссылке.";
      prompt.appendChild(node("div", "", message));
      if (!state.session) {
        const login = node("button", "", "Войти и создать задачу →");
        login.type = "button";
        login.addEventListener("click", openLogin);
        prompt.appendChild(login);
      }
      panel.appendChild(prompt);
    } else {
      const form = node("form", "task-form");
      const titleInput = node("input");
      titleInput.type = "text";
      titleInput.name = "title";
      titleInput.maxLength = 240;
      titleInput.placeholder = "Например: собрать прототип первого уровня";
      titleInput.required = true;
      const detailInput = node("textarea");
      detailInput.name = "details";
      detailInput.maxLength = 1200;
      detailInput.placeholder = "Детали задачи (необязательно)";
      const footer = node("div", "form-footer");
      footer.appendChild(node("span", "form-hint", "Сохранится в базе механик"));
      const submit = node("button", "primary-button", "Добавить задачу");
      submit.type = "submit";
      footer.appendChild(submit);
      form.append(titleInput, detailInput, footer);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        createTask(project, titleInput.value, detailInput.value, submit);
      });
      panel.appendChild(form);
    }

    if (state.databaseError) panel.appendChild(node("p", "db-error", state.databaseError));
    const list = node("div", "task-list");
    const sorted = projectTasks.slice().sort(function (a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
    if (!sorted.length) {
      list.appendChild(node("div", "task-empty", state.isOwner
        ? "Пока пусто. Добавь первый следующий шаг для проекта."
        : "После входа здесь появятся задачи проекта."));
    } else {
      sorted.forEach(function (task) { list.appendChild(makeTaskItem(task)); });
    }
    panel.appendChild(list);
    return panel;
  }

  function makeTaskItem(task) {
    const item = node("article", "task-item" + (task.completed ? " is-complete" : ""));
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.completed);
    checkbox.disabled = !state.isOwner;
    checkbox.setAttribute("aria-label", "Отметить задачу выполненной");
    checkbox.addEventListener("change", function () {
      updateTask(task.id, { completed: checkbox.checked });
    });
    const copy = node("div", "task-copy");
    copy.appendChild(node("div", "task-title", task.title));
    if (task.details) copy.appendChild(node("div", "task-details", task.details));
    if (task.created_at) {
      const date = new Date(task.created_at);
      if (!Number.isNaN(date.getTime())) {
        copy.appendChild(node("div", "task-date", "Добавлена " + new Intl.DateTimeFormat("ru-RU", {
          day: "numeric", month: "short"
        }).format(date)));
      }
    }
    item.append(checkbox, copy);
    if (state.isOwner) {
      const remove = node("button", "delete-task", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "Удалить задачу");
      remove.addEventListener("click", function () {
        if (window.confirm("Удалить задачу «" + task.title + "»?")) deleteTask(task.id);
      });
      item.appendChild(remove);
    }
    return item;
  }

  function renderProjectDetail() {
    const project = state.currentProject;
    if (!project) return;
    detailRoot.replaceChildren();

    const hero = node("div", "detail-hero");
    const image = node("img", "detail-icon");
    image.src = project.icon;
    image.alt = "";
    const titleBlock = node("div", "detail-title-block");
    titleBlock.appendChild(node("span", "detail-genre", project.genre));
    titleBlock.appendChild(node("h2", "", project.title));
    titleBlock.lastChild.id = "detail-title";
    titleBlock.appendChild(node("p", "detail-description", project.description));
    const readiness = node("div", "detail-readiness");
    readiness.appendChild(node("strong", "", readinessFor(project) + "%"));
    readiness.appendChild(node("span", "", "готовность"));
    hero.append(image, titleBlock, readiness);

    const meta = node("div", "detail-meta");
    project.platforms.forEach(function (platform) { addDetailChip(meta, platform); });
    addDetailChip(meta, project.stage);
    meta.appendChild(node("span", "detail-path", "C:\\proj\\" + project.folder));
    if (project.url) {
      const link = node("a", "detail-link", "Открыть игру ↗");
      link.href = project.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      meta.appendChild(link);
    }

    const columns = node("div", "detail-columns");
    columns.append(renderReadinessEditor(project), renderTasksPanel(project));
    detailRoot.append(hero, meta, columns);
  }

  function rerenderCurrentProject() {
    renderProjects();
    if (projectDialog.open && state.currentProject) renderProjectDetail();
  }

  async function saveReadiness(project, value) {
    state.progress[project.id] = value;
    rerenderCurrentProject();
    const { error } = await state.db.from("project_tracker_progress").upsert({
      project_id: project.id,
      gameplay_readiness: value,
      updated_at: new Date().toISOString()
    });
    if (error) {
      state.progress[project.id] = project.readiness;
      rerenderCurrentProject();
      state.databaseError = "Не удалось сохранить оценку. Проверьте таблицу project_tracker_progress.";
      renderProjectDetail();
      showToast("Не удалось сохранить оценку", "bad");
      return;
    }
    showToast("Оценка сохранена");
  }

  async function createTask(project, title, details, button) {
    const cleanTitle = title.trim();
    if (!cleanTitle || !state.db || !state.isOwner) return;
    button.disabled = true;
    const { data, error } = await state.db.from("project_tracker_tasks").insert({
      project_id: project.id,
      title: cleanTitle,
      details: details.trim()
    }).select().single();
    button.disabled = false;
    if (error) {
      state.databaseError = "Не удалось сохранить задачу. Проверьте таблицу project_tracker_tasks и её RLS.";
      renderProjectDetail();
      showToast("Задача не сохранена", "bad");
      return;
    }
    state.taskRows.push(data);
    state.databaseError = "";
    renderProjectDetail();
    renderProjects();
    showToast("Задача добавлена");
  }

  async function updateTask(taskId, patch) {
    if (!state.db || !state.isOwner) return;
    const updated = Object.assign({}, patch, { updated_at: new Date().toISOString() });
    const { data, error } = await state.db.from("project_tracker_tasks")
      .update(updated).eq("id", taskId).select().single();
    if (error) {
      state.databaseError = "Не удалось обновить задачу. Попробуйте ещё раз.";
      renderProjectDetail();
      showToast("Изменение не сохранено", "bad");
      return;
    }
    state.taskRows = state.taskRows.map(function (task) { return task.id === taskId ? data : task; });
    state.databaseError = "";
    renderProjectDetail();
    renderProjects();
  }

  async function deleteTask(taskId) {
    if (!state.db || !state.isOwner) return;
    const { error } = await state.db.from("project_tracker_tasks").delete().eq("id", taskId);
    if (error) {
      state.databaseError = "Не удалось удалить задачу. Попробуйте ещё раз.";
      renderProjectDetail();
      showToast("Задача не удалена", "bad");
      return;
    }
    state.taskRows = state.taskRows.filter(function (task) { return task.id !== taskId; });
    state.databaseError = "";
    renderProjectDetail();
    renderProjects();
    showToast("Задача удалена");
  }

  function updateAccountButton() {
    const button = $("#account-button");
    const label = $("#account-label");
    const avatar = $(".account-avatar");
    if (state.isOwner && state.session && state.session.user) {
      const email = state.session.user.email || "owner";
      label.textContent = email.split("@")[0];
      avatar.textContent = email.charAt(0).toLocaleUpperCase("ru");
      button.title = "Выйти";
    } else if (state.session) {
      label.textContent = "Нет доступа";
      avatar.textContent = "!";
      button.title = "Выйти из текущего аккаунта";
    } else {
      label.textContent = "Войти";
      avatar.textContent = "A";
      button.title = "Вход владельца";
    }
  }

  async function loadPrivateData(session) {
    if (!state.db || !session || !session.user) return;
    state.session = session;
    state.isOwner = false;
    state.databaseError = "";
    updateAccountButton();
    setCloudStatus("Проверяю права владельца", "muted");
    const ownerCheck = await state.db.rpc("is_mechanics_owner");
    if (ownerCheck.error) {
      state.databaseError = "Не найдена функция is_mechanics_owner(). Сначала выполните SQL setup механик.";
      setCloudStatus("Проверьте настройку Supabase", "warn");
      updateAccountButton();
      rerenderCurrentProject();
      return;
    }
    if (ownerCheck.data !== true) {
      setCloudStatus("Аккаунт без прав владельца", "warn");
      updateAccountButton();
      rerenderCurrentProject();
      return;
    }

    state.isOwner = true;
    setCloudStatus("База подключена · владелец", "good");
    updateAccountButton();
    const results = await Promise.all([
      state.db.from("project_tracker_tasks").select("*").order("created_at", { ascending: true }),
      state.db.from("project_tracker_progress").select("project_id,gameplay_readiness")
    ]);
    if (results[0].error || results[1].error) {
      state.databaseError = "Выполните supabase/project-tasks.sql в проекте Supabase, чтобы включить задачи и сохранение оценок.";
      state.taskRows = [];
      state.progress = Object.create(null);
      setCloudStatus("Нужно создать таблицы трекера", "warn");
    } else {
      state.taskRows = results[0].data || [];
      state.progress = Object.create(null);
      (results[1].data || []).forEach(function (row) {
        state.progress[row.project_id] = row.gameplay_readiness;
      });
      state.databaseError = "";
      setCloudStatus("База подключена · владелец", "good");
    }
    rerenderCurrentProject();
  }

  async function initializeCloud() {
    const config = window.TRACKER_SUPABASE_CONFIG;
    if (!config || !window.supabase || typeof window.supabase.createClient !== "function") {
      setCloudStatus("Каталог доступен · база не загрузилась", "warn");
      $("#metric-tasks-caption").textContent = "подключение Supabase недоступно";
      return;
    }
    state.db = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    state.db.auth.onAuthStateChange(function (event, session) {
      state.session = session;
      if (session) {
        window.setTimeout(function () { loadPrivateData(session); }, 0);
      } else {
        state.isOwner = false;
        state.taskRows = [];
        state.progress = Object.create(null);
        state.databaseError = "";
        setCloudStatus("База готова · войдите для задач", "good");
        updateAccountButton();
        rerenderCurrentProject();
      }
    });
    const { data, error } = await state.db.auth.getSession();
    if (error) {
      setCloudStatus("Не удалось открыть сессию Supabase", "warn");
      return;
    }
    state.session = data.session;
    if (state.session) await loadPrivateData(state.session);
    else setCloudStatus("База готова · войдите для задач", "good");
    updateAccountButton();
    rerenderCurrentProject();
  }

  function openLogin() {
    $("#login-message").textContent = "";
    $("#login-form").reset();
    if (!loginDialog.open) loginDialog.showModal();
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    const message = $("#login-message");
    const button = $(".login-submit");
    const email = $("#login-email").value.trim();
    if (!state.db) {
      message.textContent = "Supabase сейчас недоступен.";
      return;
    }
    button.disabled = true;
    message.textContent = "Отправляю ссылку…";
    const redirectTo = window.location.origin + window.location.pathname + window.location.search;
    const { error } = await state.db.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: redirectTo }
    });
    button.disabled = false;
    if (error) {
      message.textContent = "Не удалось отправить ссылку. Проверьте email и разрешённый redirect URL.";
      return;
    }
    message.textContent = "Ссылка отправлена. Откройте письмо на этом устройстве.";
  }

  function closeProjectDialog() {
    if (projectDialog.open) projectDialog.close();
    state.currentProject = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState({}, "", url);
  }

  function bindEvents() {
    $("#search-input").addEventListener("input", renderProjects);
    $("#sort-select").addEventListener("change", renderProjects);
    document.querySelectorAll(".filter-pill").forEach(function (button) {
      button.addEventListener("click", function () {
        state.currentFilter = button.dataset.filter;
        document.querySelectorAll(".filter-pill").forEach(function (pill) {
          pill.classList.toggle("active", pill === button);
        });
        renderProjects();
      });
    });
    $("#account-button").addEventListener("click", async function () {
      if (state.session && state.db) {
        await state.db.auth.signOut();
        showToast("Вы вышли из рабочей области");
      } else {
        openLogin();
      }
    });
    $("#login-form").addEventListener("submit", sendMagicLink);
    $(".close-login").addEventListener("click", function () { loginDialog.close(); });
    $(".close-dialog").addEventListener("click", closeProjectDialog);
    projectDialog.addEventListener("click", function (event) {
      if (event.target === projectDialog) closeProjectDialog();
    });
    loginDialog.addEventListener("click", function (event) {
      if (event.target === loginDialog) loginDialog.close();
    });
    projectDialog.addEventListener("close", function () {
      state.currentProject = null;
      const url = new URL(window.location.href);
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const active = document.activeElement;
        if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
        event.preventDefault();
        $("#search-input").focus();
      }
    });
  }

  bindEvents();
  renderProjects();
  initializeCloud();
  const initialProject = new URL(window.location.href).searchParams.get("project");
  if (initialProject) openProject(initialProject);
})();
