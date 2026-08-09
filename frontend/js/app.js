
const API_BASE ="https://ai-codereview-4ote.onrender.com";

const els = {
  navLinks: document.querySelectorAll(".site-nav__link"),
  views: { review: document.getElementById("view-review"), history: document.getElementById("view-history") },

  codeInput: document.getElementById("code-input"),
  fileInput: document.getElementById("file-input"),
  dropzone: document.getElementById("dropzone"),
  dropzoneFilename: document.getElementById("dropzone-filename"),

  submitBtn: document.getElementById("submit-review"),
  clearBtn: document.getElementById("clear-review"),
  intakeError: document.getElementById("intake-error"),

  loadingState: document.getElementById("loading-state"),
  loadingLabel: document.getElementById("loading-label"),

  results: document.getElementById("results"),
  resultFilename: document.getElementById("result-filename"),
  resultLanguage: document.getElementById("result-language"),
  severitySummary: document.getElementById("severity-summary"),
  staticIssues: document.getElementById("static-issues"),
  staticEmpty: document.getElementById("static-empty"),

  aiUnavailable: document.getElementById("ai-unavailable"),
  aiContent: document.getElementById("ai-content"),
  aiExplanation: document.getElementById("ai-explanation"),
  aiComplexity: document.getElementById("ai-complexity"),
  aiBugs: document.getElementById("ai-bugs"),
  aiSmells: document.getElementById("ai-smells"),
  aiNaming: document.getElementById("ai-naming"),
  aiPerformance: document.getElementById("ai-performance"),
  aiRefactoring: document.getElementById("ai-refactoring"),
  aiDocumentation: document.getElementById("ai-documentation"),

  historyList: document.getElementById("history-list"),
  historyEmpty: document.getElementById("history-empty"),
};

let selectedFile = null;

/* ---------------- Navigation ---------------- */

els.navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    els.navLinks.forEach((l) => l.classList.remove("is-active"));
    link.classList.add("is-active");
    Object.values(els.views).forEach((v) => (v.hidden = true));
    els.views[link.dataset.view].hidden = false;
    if (link.dataset.view === "history") loadHistory();
  });
});

/* ---------------- File selection / drag & drop ---------------- */

els.fileInput.addEventListener("change", () => {
  selectedFile = els.fileInput.files[0] || null;
  updateDropzoneLabel();
});

["dragenter", "dragover"].forEach((evt) =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("is-dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("is-dragover");
  })
);

els.dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    selectedFile = file;
    els.fileInput.files = e.dataTransfer.files;
    updateDropzoneLabel();
  }
});

function updateDropzoneLabel() {
  if (selectedFile) {
    els.dropzoneFilename.textContent = selectedFile.name;
    els.dropzoneFilename.hidden = false;
  } else {
    els.dropzoneFilename.hidden = true;
  }
}

/* ---------------- Submit ---------------- */

els.clearBtn.addEventListener("click", () => {
  els.codeInput.value = "";
  selectedFile = null;
  els.fileInput.value = "";
  updateDropzoneLabel();
  hideError();
  els.results.hidden = true;
});

els.submitBtn.addEventListener("click", submitReview);

async function submitReview() {
  hideError();
  const pastedCode = els.codeInput.value.trim();

  if (!pastedCode && !selectedFile) {
    showError("Paste some code or choose a file first.");
    return;
  }

  setLoading(true, selectedFile ? "Reading your file" : "Reading your code");
  els.results.hidden = true;

  try {
    let response;
    if (selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      response = await fetch(`${API_BASE}/api/review`, { method: "POST", body: formData });
    } else {
      response = await fetch(`${API_BASE}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pastedCode }),
      });
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "The server couldn't review this code.");
    }

    setLoading(true, "Running the AI review");
    const review = await response.json();
    renderReview(review);
  } catch (err) {
    showError(err.message || "Something went wrong. Is the backend running?");
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading, label) {
  els.loadingState.hidden = !isLoading;
  els.submitBtn.disabled = isLoading;
  if (label) els.loadingLabel.textContent = label;
}

function showError(message) {
  els.intakeError.textContent = message;
  els.intakeError.hidden = false;
}
function hideError() {
  els.intakeError.hidden = true;
}

/* ---------------- Rendering ---------------- */

function severityChip(level, count) {
  if (!count) return "";
  return `<span class="severity-chip severity-chip--${level}">${count} ${level}</span>`;
}

function renderNoteList(container, emptyEl, items, { lineKey = "line", categoryKey = "category", messageKey = "message", suggestionKey = "suggestion", severityKey = "severity" } = {}) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  items.forEach((item) => {
    const li = document.createElement("li");
    const severity = item[severityKey] || "low";
    li.className = `note note--${severity}`;

    const line = item[lineKey];
    const category = item[categoryKey];

    li.innerHTML = `
      <div class="note__meta">
        ${line ? `<span class="note__line">Line ${escapeHtml(String(line))}</span>` : ""}
        ${category ? `<span class="note__category">${escapeHtml(category)}</span>` : ""}
      </div>
      <p class="note__message">${escapeHtml(item[messageKey] || item.issue || "")}</p>
      ${item[suggestionKey] ? `<p class="note__suggestion">${escapeHtml(item[suggestionKey])}</p>` : ""}
    `;
    container.appendChild(li);
  });
}

function renderReview(review) {
  els.resultFilename.textContent = review.filename;
  els.resultLanguage.textContent = review.language;

  // Static analysis
  const { summary, issues } = review.static;
  els.severitySummary.innerHTML =
    severityChip("high", summary.high) + severityChip("medium", summary.medium) + severityChip("low", summary.low);

  renderNoteList(els.staticIssues, els.staticEmpty, issues);

  // AI review
  const ai = review.ai || {};
  if (ai.unavailable) {
    els.aiUnavailable.hidden = false;
    els.aiUnavailable.textContent = ai.message || "AI review is unavailable right now.";
    els.aiContent.style.opacity = "0.5";
  } else {
    els.aiUnavailable.hidden = true;
    els.aiContent.style.opacity = "1";
  }

  els.aiExplanation.textContent = ai.explanation || "—";
  els.aiComplexity.textContent = ai.complexity || "—";
  els.aiDocumentation.textContent = ai.documentation || "—";

  renderNoteList(els.aiBugs, null, ai.bugs, { messageKey: "issue" });
  renderNoteList(els.aiSmells, null, ai.codeSmells, { messageKey: "issue" });
  renderNoteList(els.aiNaming, null, ai.namingSuggestions, { messageKey: "issue" });
  renderNoteList(els.aiPerformance, null, ai.performanceSuggestions, { messageKey: "issue" });
  renderNoteList(els.aiRefactoring, null, ai.refactoringSuggestions, { messageKey: "issue" });

  els.results.hidden = false;
  els.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- History ---------------- */

async function loadHistory() {
  try {
    const response = await fetch(`${API_BASE}/api/history`);
    const history = await response.json();

    els.historyList.innerHTML = "";
    if (!history.length) {
      els.historyEmpty.hidden = false;
      return;
    }
    els.historyEmpty.hidden = true;

    history.forEach((review) => {
      const li = document.createElement("li");
      li.className = "history-item";
      const date = new Date(review.createdAt).toLocaleString();
      const s = review.static.summary;
      li.innerHTML = `
        <div>
          <div class="history-item__name">${escapeHtml(review.filename)} · ${escapeHtml(review.language)}</div>
          <div class="history-item__date">${escapeHtml(date)}</div>
        </div>
        <div class="history-item__counts">
          ${severityChip("high", s.high)}${severityChip("medium", s.medium)}${severityChip("low", s.low)}
        </div>
      `;
      li.addEventListener("click", () => {
        renderReview(review);
        els.navLinks.forEach((l) => l.classList.remove("is-active"));
        document.querySelector('[data-view="review"]').classList.add("is-active");
        els.views.history.hidden = true;
        els.views.review.hidden = false;
      });
      els.historyList.appendChild(li);
    });
  } catch {
    els.historyEmpty.hidden = false;
    els.historyEmpty.textContent = "Couldn't reach the backend. Is it running?";
  }
}

/* ---------------- Utils ---------------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
