const STORE_KEY = "thinkpak-idea-studio-v1";

const state = loadState();

const el = {
  promptCategory: document.getElementById("promptCategory"),
  ideaTitle: document.getElementById("ideaTitle"),
  ideaNote: document.getElementById("ideaNote"),
  addIdea: document.getElementById("addIdea"),
  ideaList: document.getElementById("ideaList"),
  shapeIdeaSelect: document.getElementById("shapeIdeaSelect"),
  problem: document.getElementById("problem"),
  audience: document.getElementById("audience"),
  value: document.getElementById("value"),
  saveShape: document.getElementById("saveShape"),
  conceptPreview: document.getElementById("conceptPreview"),
  scoreBoard: document.getElementById("scoreBoard"),
  computeRanking: document.getElementById("computeRanking"),
  rankingList: document.getElementById("rankingList"),
  winnerRationale: document.getElementById("winnerRationale"),
  resetData: document.getElementById("resetData"),
};

el.addIdea.addEventListener("click", onAddIdea);
el.saveShape.addEventListener("click", onSaveShape);
el.shapeIdeaSelect.addEventListener("change", onShapeSelectionChange);
el.computeRanking.addEventListener("click", onComputeRanking);
el.resetData.addEventListener("click", onResetData);

render();

function loadState() {
  const fallback = {
    ideas: [],
    conceptDetails: {},
    criteria: ["Feasibility", "Novelty", "Timing"],
    scores: {},
  };

  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas : [],
      conceptDetails: parsed.conceptDetails || {},
      criteria: Array.isArray(parsed.criteria) ? parsed.criteria : fallback.criteria,
      scores: parsed.scores || {},
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function onAddIdea() {
  const title = el.ideaTitle.value.trim();
  const note = el.ideaNote.value.trim();
  if (!title || !note) return;

  state.ideas.push({
    id: crypto.randomUUID(),
    title,
    note,
    promptCategory: el.promptCategory.value,
    createdAt: new Date().toISOString(),
  });

  el.ideaTitle.value = "";
  el.ideaNote.value = "";

  saveState();
  render();
}

function onShapeSelectionChange() {
  const ideaId = el.shapeIdeaSelect.value;
  const detail = state.conceptDetails[ideaId] || { problem: "", audience: "", value: "" };
  el.problem.value = detail.problem;
  el.audience.value = detail.audience;
  el.value.value = detail.value;
  renderConceptPreview(ideaId);
}

function onSaveShape() {
  const ideaId = el.shapeIdeaSelect.value;
  if (!ideaId) return;

  state.conceptDetails[ideaId] = {
    problem: el.problem.value.trim(),
    audience: el.audience.value.trim(),
    value: el.value.value.trim(),
  };

  saveState();
  renderConceptPreview(ideaId);
}

function onComputeRanking() {
  const ranking = state.ideas.map((idea) => {
    const ideaScores = state.scores[idea.id] || {};
    const total = state.criteria.reduce((sum, c) => sum + Number(ideaScores[c] || 0), 0);
    return { id: idea.id, title: idea.title, total };
  });

  ranking.sort((a, b) => b.total - a.total);
  el.rankingList.innerHTML = ranking
    .map((r) => `<li>${escapeHtml(r.title)} - ${r.total} pts</li>`)
    .join("");

  if (ranking.length > 0) {
    const winner = ranking[0];
    const detail = state.conceptDetails[winner.id] || {};
    const message = detail.value
      ? `Winner: ${winner.title}. Best value claim: ${detail.value}`
      : `Winner: ${winner.title}. Add a value statement in Shape for stronger rationale.`;
    el.winnerRationale.textContent = message;
  }
}

function onResetData() {
  if (!confirm("Delete all ideas and scores?")) return;
  localStorage.removeItem(STORE_KEY);
  location.reload();
}

function render() {
  el.ideaList.innerHTML = state.ideas
    .map((idea) => `<li>${escapeHtml(idea.title)} (${escapeHtml(idea.promptCategory)})</li>`)
    .join("");

  el.shapeIdeaSelect.innerHTML =
    `<option value="">Select an idea</option>` +
    state.ideas
      .map((idea) => `<option value="${idea.id}">${escapeHtml(idea.title)}</option>`)
      .join("");

  renderScoreBoard();
  renderConceptPreview(el.shapeIdeaSelect.value);
}

function renderScoreBoard() {
  const rows = state.ideas
    .map((idea) => {
      const cells = state.criteria
        .map((c) => {
          const value = Number((state.scores[idea.id] || {})[c] || 0);
          return `<label>${escapeHtml(c)} <input data-idea-id="${idea.id}" data-criterion="${escapeHtml(
            c
          )}" type="number" min="0" max="5" value="${value}" /></label>`;
        })
        .join(" ");
      return `<div class="score-row"><strong>${escapeHtml(idea.title)}</strong><div>${cells}</div></div>`;
    })
    .join("");

  el.scoreBoard.innerHTML = rows || "<p>Add ideas to start scoring.</p>";
  el.scoreBoard.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const ideaId = event.target.getAttribute("data-idea-id");
      const criterion = event.target.getAttribute("data-criterion");
      const value = clamp(Number(event.target.value), 0, 5);
      state.scores[ideaId] = state.scores[ideaId] || {};
      state.scores[ideaId][criterion] = value;
      saveState();
    });
  });
}

function renderConceptPreview(ideaId) {
  if (!ideaId) {
    el.conceptPreview.textContent = "Select an idea to preview concept details.";
    return;
  }

  const idea = state.ideas.find((i) => i.id === ideaId);
  const detail = state.conceptDetails[ideaId] || {};
  el.conceptPreview.textContent = [
    `Idea: ${idea ? idea.title : "Unknown"}`,
    `Problem: ${detail.problem || "-"}`,
    `Audience: ${detail.audience || "-"}`,
    `Value: ${detail.value || "-"}`,
  ].join("\n");
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
