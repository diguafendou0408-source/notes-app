(() => {
  "use strict";

  const STORAGE_KEY = "codex-learning-notes-v1";
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    list: $("#note-list"),
    count: $("#note-count"),
    editor: $("#editor"),
    emptyState: $("#empty-state"),
    title: $("#note-title"),
    content: $("#note-content"),
    noteMeta: $("#note-meta"),
    preview: $("#note-preview"),
    newButton: $("#new-note-button"),
    emptyNewButton: $("#empty-new-note-button"),
    deleteButton: $("#delete-note-button"),
    deleteDialog: $("#delete-dialog"),
  };

  let state = loadState();

  function createNote() {
    const now = Date.now();
    return { id: String(now), title: "无标题笔记", content: "", createdAt: now, updatedAt: now };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.notes) && saved.notes.length) {
        const notes = saved.notes.map((note) => ({
          ...note,
          createdAt: note.createdAt || note.updatedAt || Date.now(),
        }));
        return { notes, selectedId: saved.selectedId || notes[0].id };
      }
    } catch (error) {
      console.warn("无法读取保存的笔记，将创建新笔记。", error);
    }
    const firstNote = createNote();
    return { notes: [firstNote], selectedId: firstNote.id };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function selectedNote() {
    return state.notes.find((note) => note.id === state.selectedId);
  }

  function displayTitle(note) {
    return note.title.trim() || "无标题笔记";
  }

  function preview(note) {
    const text = note.content.replace(/\s+/g, " ").trim();
    return text || "还没有内容";
  }

  function formatDateTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  }

  function formatNoteMeta(note) {
    return `创建于：${formatDateTime(note.createdAt)} · 上次编辑：${formatDateTime(note.updatedAt)}`;
  }

  function escapeHtml(text) {
    return text.replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]);
  }

  function safeLink(url) {
    const normalized = url.trim();
    return /^(https?:|mailto:|\/|#)/i.test(normalized) ? normalized : "";
  }

  function renderInline(text) {
    let rendered = escapeHtml(text);
    rendered = rendered.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, url) => {
      const href = safeLink(url);
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    });
    rendered = rendered.replace(/`([^`]+)`/g, "<code>$1</code>");
    rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    rendered = rendered.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    rendered = rendered.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    rendered = rendered.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
    return rendered;
  }

  function renderMarkdown(source) {
    if (!source.trim()) return '<p class="preview-placeholder">预览将显示在这里…</p>';

    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let listType = null;
    let codeLines = null;
    const closeList = () => {
      if (listType) html.push(`</${listType}>`);
      listType = null;
    };

    lines.forEach((line) => {
      if (/^```/.test(line)) {
        if (codeLines) {
          html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
          codeLines = null;
        } else {
          closeList();
          codeLines = [];
        }
        return;
      }
      if (codeLines) {
        codeLines.push(line);
        return;
      }

      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const nextType = unordered ? "ul" : "ol";
        if (listType !== nextType) {
          closeList();
          html.push(`<${nextType}>`);
          listType = nextType;
        }
        html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
        return;
      }
      closeList();
      if (!line.trim()) return;
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        html.push("<hr>");
      } else if (line.startsWith("> ")) {
        html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      } else {
        html.push(`<p>${renderInline(line)}</p>`);
      }
    });
    closeList();
    if (codeLines) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    return html.join("");
  }

  function renderList() {
    elements.list.replaceChildren();
    elements.count.textContent = `共 ${state.notes.length} 条笔记`;

    [...state.notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((note) => {
        const item = document.createElement("button");
        item.className = `note-item${note.id === state.selectedId ? " is-active" : ""}`;
        item.type = "button";
        item.innerHTML = `<span class="note-item-title"></span><span class="note-item-preview"></span>`;
        item.querySelector(".note-item-title").textContent = displayTitle(note);
        item.querySelector(".note-item-preview").textContent = preview(note);
        item.addEventListener("click", () => {
          state.selectedId = note.id;
          saveState();
          render();
        });
        elements.list.append(item);
      });
  }

  function renderEditor() {
    const note = selectedNote();
    const hasNote = Boolean(note);
    elements.editor.hidden = !hasNote;
    elements.emptyState.hidden = hasNote;
    elements.deleteButton.disabled = !hasNote;
    if (!note) return;

    elements.title.value = note.title;
    elements.content.value = note.content;
    elements.noteMeta.textContent = formatNoteMeta(note);
    elements.preview.innerHTML = renderMarkdown(note.content);
  }

  function render() {
    renderList();
    renderEditor();
  }

  function addNote() {
    const note = createNote();
    state.notes.push(note);
    state.selectedId = note.id;
    saveState();
    render();
    elements.title.focus();
    elements.title.select();
  }

  function updateSelectedNote() {
    const note = selectedNote();
    if (!note) return;
    note.title = elements.title.value;
    note.content = elements.content.value;
    note.updatedAt = Date.now();
    saveState();
    renderList();
    elements.noteMeta.textContent = formatNoteMeta(note);
    elements.preview.innerHTML = renderMarkdown(note.content);
  }

  function deleteSelectedNote() {
    const note = selectedNote();
    if (!note) return;
    elements.deleteDialog.showModal();
  }

  function confirmDeletion() {
    const note = selectedNote();
    if (!note) return;
    state.notes = state.notes.filter((item) => item.id !== note.id);
    state.selectedId = state.notes[0]?.id || null;
    saveState();
    render();
  }

  elements.newButton.addEventListener("click", addNote);
  elements.emptyNewButton.addEventListener("click", addNote);
  elements.deleteButton.addEventListener("click", deleteSelectedNote);
  elements.deleteDialog.addEventListener("close", () => {
    if (elements.deleteDialog.returnValue === "confirm") confirmDeletion();
  });
  elements.title.addEventListener("input", updateSelectedNote);
  elements.content.addEventListener("input", updateSelectedNote);

  saveState();
  render();
})();
