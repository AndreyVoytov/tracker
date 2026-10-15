(function () {
  "use strict";

  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const projects = Array.isArray(window.TRACKER_PROJECTS) ? window.TRACKER_PROJECTS : [];
  const state = {
    db: null,
    currentProject: null,
    editingProject: false,
    editingField: null,
    focusFieldOnRender: false,
    taskRows: [],
    progress: Object.create(null),
    databaseError: "",
    toastTimer: null
  };

  const grid = $("#project-grid");
  const projectDialog = $("#project-dialog");
  const detailRoot = $("#project-detail");
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

  function projectMatches(project, query) {
    const text = [project.title, project.folder, project.genre, project.description].join(" ").toLocaleLowerCase("ru");
    return !query || text.includes(query);
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
    const readiness = readinessFor(project);
    card.classList.toggle("project-card--low-readiness", readiness <= 10);
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
    art.append(image);

    const content = node("div", "card-content");
    const title = node("h3", "", project.title);
    const description = node("p", "", project.description);
    const row = node("div", "readiness-row");
    const left = node("span", "readiness-label", "ГОТОВНОСТЬ ГЕЙМПЛЕЯ");
    const value = node("strong", "readiness-value", readiness + "%");
    row.append(left, value);
    content.append(title, description, row);
    open.append(art, content);
    card.appendChild(open);
    const edit = node("button", "card-edit", "✎");
    edit.type = "button";
    edit.setAttribute("aria-label", "Редактировать карточку «" + project.title + "»");
    edit.title = "Редактировать карточку";
    edit.addEventListener("click", function (event) {
      event.stopPropagation();
      openProject(project.id);
      requestProjectEdit("title");
    });
    card.appendChild(edit);
    if (project.url) {
      const link = node("a", "card-url");
      link.href = project.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "Открыть билд " + project.title + " в новой вкладке");
      link.title = project.url;
      link.append(
        node("span", "card-url-label", "Cloudflare Pages"),
        node("span", "card-url-text", project.url),
        node("span", "card-url-arrow", "↗")
      );
      card.appendChild(link);
    }
    const projectTasks = state.taskRows.filter(function (task) {
      return task.project_id === project.id;
    });
    if (projectTasks.length) {
      const taskPreview = node("ul", "project-task-preview");
      taskPreview.setAttribute("aria-label", "Задачи проекта «" + project.title + "»");
      projectTasks.forEach(function (task) {
        const strip = node("li", "project-task-strip" + (task.completed ? " is-complete" : ""), task.title);
        strip.title = task.title;
        taskPreview.appendChild(strip);
      });
      card.appendChild(taskPreview);
    }
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
  }

  function openProject(projectId) {
    const project = projects.find(function (item) { return item.id === projectId; });
    if (!project) return;
    state.currentProject = project;
    state.editingProject = false;
    state.editingField = null;
    renderProjectDetail();
    if (!projectDialog.open) projectDialog.showModal();
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.id);
    window.history.replaceState({}, "", url);
  }

  function addDetailChip(container, text) {
    container.appendChild(node("span", "detail-chip", text));
  }

  function detailEditButton(field, label) {
    const button = node("button", "detail-field-edit", "✎");
    button.type = "button";
    button.title = "Изменить: " + label;
    button.setAttribute("aria-label", "Изменить поле «" + label + "»");
    button.addEventListener("click", function () { requestProjectEdit(field); });
    return button;
  }

  function detailField(tagName, className, value, field, label) {
    const row = node("div", "detail-field-row");
    const text = node(tagName, className, value);
    row.append(text, detailEditButton(field, label));
    return { row: row, text: text };
  }

  function requestProjectEdit(field) {
    if (!state.currentProject) return;
    state.editingProject = true;
    state.editingField = field || "title";
    state.focusFieldOnRender = true;
    renderProjectDetail();
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
    slider.disabled = !state.db;
    const sliderLabels = node("div", "slider-labels");
    sliderLabels.append(node("span", "", "Черновик"), node("span", "", "Готово"));
    const editorNote = node("div", "editor-note");
    editorNote.appendChild(node("strong", "", "Изменения синхронизируются с базой без входа."));
    slider.addEventListener("input", function () {
      const number = $(".detail-readiness strong");
      if (number) number.textContent = slider.value + "%";
    });
    slider.addEventListener("change", function () {
      if (state.db) saveReadiness(project, Number(slider.value));
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

    {
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
      list.appendChild(node("div", "task-empty", "Пока пусто. Добавь первый следующий шаг для проекта."));
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
    checkbox.disabled = !state.db;
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
    if (state.db) {
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

  function renderProjectEditor(project) {
    const panel = node("section", "project-editor");
    const heading = node("div", "project-editor-heading");
    heading.appendChild(node("h3", "", "Поля карточки"));
    const cancel = node("button", "editor-cancel", "Отмена");
    cancel.type = "button";
    cancel.addEventListener("click", function () {
      state.editingProject = false;
      renderProjectDetail();
    });
    heading.appendChild(cancel);
    panel.appendChild(heading);

    const form = node("form", "project-editor-form");
    function addField(name, labelText, type, value, options) {
      const wrapper = node("label", "project-field");
      wrapper.dataset.field = name;
      wrapper.appendChild(node("span", "", labelText));
      const input = type === "textarea" ? node("textarea") : node("input");
      input.name = name;
      if (type !== "textarea") input.type = type || "text";
      input.value = value == null ? "" : String(value);
      if (options && options.maxLength) input.maxLength = options.maxLength;
      if (options && options.required) input.required = true;
      if (options && options.min !== undefined) input.min = options.min;
      if (options && options.max !== undefined) input.max = options.max;
      wrapper.appendChild(input);
      form.appendChild(wrapper);
      return input;
    }
    addField("title", "Название", "text", project.title, { required: true, maxLength: 100 });
    addField("folder", "Папка проекта", "text", project.folder, { required: true, maxLength: 120 });
    addField("genre", "Жанр", "text", project.genre, { required: true, maxLength: 100 });
    addField("description", "Краткое описание", "textarea", project.description, { required: true, maxLength: 500 });
    addField("platforms", "Платформы (через запятую)", "text", project.platforms.join(", "), { maxLength: 160 });
    addField("stage", "Этап", "text", project.stage, { required: true, maxLength: 80 });
    addField("url", "Ссылка на билд", "url", project.url || "", { maxLength: 500 });
    addField("readiness", "Готовность геймплея (%)", "number", readinessFor(project), { required: true, min: 0, max: 100 });

    const imageField = node("label", "project-field project-image-field");
    imageField.dataset.field = "iconFile";
    imageField.appendChild(node("span", "", "Обложка проекта"));
    const preview = node("img", "project-image-preview");
    preview.src = project.icon;
    preview.alt = "Текущая обложка проекта";
    const file = node("input");
    file.type = "file";
    file.name = "iconFile";
    file.accept = "image/png,image/jpeg,image/webp";
    file.addEventListener("change", function () {
      const selected = file.files && file.files[0];
      if (selected) preview.src = URL.createObjectURL(selected);
    });
    const imageControls = node("div", "project-image-controls");
    imageControls.append(preview, file);
    imageField.appendChild(imageControls);
    imageField.appendChild(node("small", "", "PNG, JPEG или WebP, до 5 МБ"));
    form.appendChild(imageField);

    const footer = node("div", "project-editor-footer");
    const hint = node("span", "form-hint", "Сохранится в общей базе трекера");
    const save = node("button", "primary-button", "Сохранить изменения");
    save.type = "submit";
    footer.append(hint, save);
    form.appendChild(footer);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      saveProject(project, form, save);
    });
    panel.appendChild(form);
    return panel;
  }

  async function saveProject(project, form, button) {
    if (!state.db) return;
    const elements = form.elements;
    const platforms = elements.platforms.value.split(",").map(function (value) { return value.trim(); }).filter(Boolean);
    const readiness = Number(elements.readiness.value);
    const file = elements.iconFile.files && elements.iconFile.files[0];
    if (!Number.isInteger(readiness) || readiness < 0 || readiness > 100) {
      showToast("Готовность должна быть от 0 до 100", "bad");
      return;
    }
    if (file && (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024)) {
      showToast("Выберите PNG, JPEG или WebP до 5 МБ", "bad");
      return;
    }

    button.disabled = true;
    button.textContent = "Сохраняю…";
    let icon = project.icon;
    if (file) {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = "project-icons/" + project.id + "/" + Date.now() + "." + extension;
      const uploaded = await state.db.storage.from("project-tracker-assets").upload(path, file, {
        contentType: file.type,
        upsert: false
      });
      if (uploaded.error) {
        button.disabled = false;
        button.textContent = "Сохранить изменения";
        showToast("Не удалось загрузить обложку. Проверьте настройки хранилища.", "bad");
        return;
      }
      icon = state.db.storage.from("project-tracker-assets").getPublicUrl(path).data.publicUrl;
    }

    const row = {
      project_id: project.id,
      title: elements.title.value.trim(),
      folder: elements.folder.value.trim(),
      genre: elements.genre.value.trim(),
      description: elements.description.value.trim(),
      platforms: platforms,
      stage: elements.stage.value.trim(),
      url: elements.url.value.trim() || null,
      icon: icon,
      updated_at: new Date().toISOString()
    };
    const saved = await state.db.from("project_tracker_projects").upsert(row);
    if (saved.error) {
      button.disabled = false;
      button.textContent = "Сохранить изменения";
      showToast("Не удалось сохранить поля карточки. Проверьте таблицу project_tracker_projects.", "bad");
      return;
    }

    const progress = await state.db.from("project_tracker_progress").upsert({
      project_id: project.id,
      gameplay_readiness: readiness,
      updated_at: new Date().toISOString()
    });
    Object.assign(project, row);
    if (!progress.error) state.progress[project.id] = readiness;
    button.disabled = false;
    button.textContent = "Сохранить изменения";
    if (progress.error) {
      renderProjects();
      renderProjectDetail();
      state.databaseError = "Карточка сохранена, но оценка не обновилась. Проверьте таблицу project_tracker_progress.";
      showToast("Карточка сохранена; оценка не обновилась", "bad");
      return;
    }
    state.editingProject = false;
    state.editingField = null;
    state.databaseError = "";
    rerenderCurrentProject();
    showToast("Карточка проекта обновлена");
  }

  async function loadProjectMetadata() {
    if (!state.db) return;
    const { data, error } = await state.db.from("project_tracker_projects").select("*");
    if (error) {
      console.warn("Project metadata is unavailable. Apply supabase/project-catalog.sql.", error.message);
      return;
    }
    (data || []).forEach(function (row) {
      const project = projects.find(function (item) { return item.id === row.project_id; });
      if (project) Object.assign(project, row, { id: row.project_id });
    });
    renderProjects();
    if (state.currentProject) renderProjectDetail();
  }

  function renderProjectDetail() {
    const project = state.currentProject;
    if (!project) return;
    detailRoot.replaceChildren();

    const hero = node("div", "detail-hero");
    const imageWrap = node("div", "detail-icon-wrap");
    const image = node("img", "detail-icon");
    image.src = project.icon;
    image.alt = "";
    imageWrap.append(image, detailEditButton("iconFile", "обложка проекта"));
    const titleBlock = node("div", "detail-title-block");
    const genre = detailField("span", "detail-genre", project.genre, "genre", "жанр");
    const title = detailField("h2", "", project.title, "title", "название");
    title.text.id = "detail-title";
    const description = detailField("p", "detail-description", project.description, "description", "описание");
    titleBlock.append(genre.row, title.row, description.row);
    const edit = node("button", "detail-edit", state.editingProject ? "✕ Закрыть редактор" : "Поля карточки");
    edit.type = "button";
    edit.addEventListener("click", function () {
      if (state.editingProject) {
        state.editingProject = false;
        state.editingField = null;
        renderProjectDetail();
      } else {
        requestProjectEdit("title");
      }
    });
    titleBlock.appendChild(edit);
    const readiness = node("div", "detail-readiness");
    readiness.appendChild(node("strong", "", readinessFor(project) + "%"));
    readiness.appendChild(node("span", "", "готовность"));
    readiness.appendChild(detailEditButton("readiness", "готовность геймплея"));
    hero.append(imageWrap, titleBlock, readiness);

    const meta = node("div", "detail-meta");
    const platforms = node("div", "detail-meta-group");
    project.platforms.forEach(function (platform) { addDetailChip(platforms, platform); });
    platforms.appendChild(detailEditButton("platforms", "платформы"));
    meta.appendChild(platforms);
    const stage = node("div", "detail-meta-field");
    addDetailChip(stage, project.stage);
    stage.appendChild(detailEditButton("stage", "этап"));
    meta.appendChild(stage);
    const folder = node("div", "detail-meta-field detail-path-field");
    folder.appendChild(node("span", "detail-path", "C:\\proj\\" + project.folder));
    folder.appendChild(detailEditButton("folder", "папка проекта"));
    meta.appendChild(folder);
    if (project.url) {
      const linkGroup = node("div", "detail-meta-field");
      const link = node("a", "detail-link", "Открыть игру ↗");
      link.href = project.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      linkGroup.append(link, detailEditButton("url", "ссылку на билд"));
      meta.appendChild(linkGroup);
    } else {
      const linkGroup = node("div", "detail-meta-field");
      linkGroup.append(node("span", "detail-link-missing", "Ссылка на билд не добавлена"), detailEditButton("url", "ссылку на билд"));
      meta.appendChild(linkGroup);
    }
    if (project.id === "isles-of-the-tides") {
      const editorGroup = node("div", "detail-meta-field");
      const editorLink = node("a", "detail-link", "Редактор сюжетной таблицы ↗");
      editorLink.href = "./isles-tides-editor.html";
      editorLink.target = "_blank";
      editorLink.rel = "noopener noreferrer";
      editorGroup.appendChild(editorLink);
      meta.appendChild(editorGroup);
    }

    const columns = node("div", "detail-columns");
    columns.append(renderReadinessEditor(project), renderTasksPanel(project));
    detailRoot.append(hero, meta);
    if (state.editingProject) {
      detailRoot.appendChild(renderProjectEditor(project));
      if (state.focusFieldOnRender && state.editingField) {
        const field = state.editingField;
        state.focusFieldOnRender = false;
        window.requestAnimationFrame(function () {
          const input = $("[name='" + field + "']", detailRoot);
          if (input) {
            input.focus();
            input.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        });
      }
    }
    detailRoot.appendChild(columns);
  }

  function rerenderCurrentProject() {
    renderProjects();
    if (projectDialog.open && state.currentProject) renderProjectDetail();
  }

  async function saveReadiness(project, value) {
    if (!state.db) return;
    const previousValue = readinessFor(project);
    state.progress[project.id] = value;
    rerenderCurrentProject();
    const { error } = await state.db.from("project_tracker_progress").upsert({
      project_id: project.id,
      gameplay_readiness: value,
      updated_at: new Date().toISOString()
    });
    if (error) {
      state.progress[project.id] = previousValue;
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
    if (!cleanTitle || !state.db) return;
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
    if (!state.db) return;
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
    if (!state.db) return;
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

  async function loadTrackerData() {
    if (!state.db) return;
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
      setCloudStatus("База подключена · редактирование без входа", "good");
    }
    rerenderCurrentProject();
  }

  async function initializeCloud() {
    const config = window.TRACKER_SUPABASE_CONFIG;
    if (!config || !window.supabase || typeof window.supabase.createClient !== "function") {
      setCloudStatus("Проекты доступны · база не загрузилась", "warn");
      return;
    }
    state.db = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    try {
      await Promise.all([loadProjectMetadata(), loadTrackerData()]);
    } catch (error) {
      state.databaseError = "Не удалось подключиться к базе. Обновите страницу и попробуйте ещё раз.";
      setCloudStatus("База временно недоступна", "warn");
      rerenderCurrentProject();
    }
  }

  function closeProjectDialog() {
    if (projectDialog.open) projectDialog.close();
    state.currentProject = null;
    state.editingProject = false;
    state.editingField = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState({}, "", url);
  }

  function bindEvents() {
    $("#search-input").addEventListener("input", renderProjects);
    $("#sort-select").addEventListener("change", renderProjects);
    $(".close-dialog").addEventListener("click", closeProjectDialog);
    projectDialog.addEventListener("click", function (event) {
      if (event.target === projectDialog) closeProjectDialog();
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
