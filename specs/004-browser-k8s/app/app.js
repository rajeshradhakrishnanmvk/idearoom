document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = 'browser-cluster-state-v1';

    const artifactForm = document.getElementById('artifact-form');
    const nodeForm = document.getElementById('node-form');
    const workloadForm = document.getElementById('workload-form');

    const artifactRefSelect = document.getElementById('artifact-ref');
    const scheduleModeSelect = document.getElementById('schedule-mode');
    const manualNodeSelect = document.getElementById('manual-node');

    const tickAllBtn = document.getElementById('tick-all');
    const stopAllBtn = document.getElementById('stop-all');

    const summaryEl = document.getElementById('cluster-summary');
    const artifactListEl = document.getElementById('artifact-list');
    const workloadListEl = document.getElementById('workload-list');
    const nodeListEl = document.getElementById('node-list');
    const eventListEl = document.getElementById('event-list');

    const workerHandles = new Map();

    const state = loadState();

    function defaultNodes() {
        return [
            { name: 'node-a', workerCapacity: 4 },
            { name: 'node-b', workerCapacity: 4 }
        ];
    }

    function loadState() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                artifacts: [],
                nodes: defaultNodes(),
                workloads: [],
                events: []
            };
        }

        try {
            const parsed = JSON.parse(raw);
            parsed.artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
            parsed.nodes = Array.isArray(parsed.nodes) ? parsed.nodes : defaultNodes();
            parsed.workloads = Array.isArray(parsed.workloads) ? parsed.workloads : [];
            parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
            return parsed;
        } catch (error) {
            return {
                artifacts: [],
                nodes: defaultNodes(),
                workloads: [],
                events: []
            };
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function addEvent(type, message, severity) {
        state.events.unshift({
            at: Date.now(),
            type: type,
            message: message,
            severity: severity || 'info'
        });
        state.events = state.events.slice(0, 200);
    }

    function buildArtifactRef(namespace, name, revision) {
        return `${namespace.trim().toLowerCase()}/${name.trim().toLowerCase()}@${revision.trim().toLowerCase()}`;
    }

    function workerUsage(nodeName) {
        return state.workloads.filter(function (w) {
            return w.node === nodeName && w.status === 'Running';
        }).length;
    }

    function pickNode() {
        const candidates = state.nodes
            .map(function (node) {
                const used = workerUsage(node.name);
                const free = node.workerCapacity - used;
                return { node: node, free: free, score: free * 2 - used };
            })
            .filter(function (entry) {
                return entry.free >= 1;
            })
            .sort(function (a, b) {
                return b.score - a.score;
            });

        return candidates.length ? candidates[0].node.name : null;
    }

    function getArtifactByRef(ref) {
        return state.artifacts.find(function (artifact) {
            return artifact.ref === ref;
        });
    }

    function createWorkerRuntimeCode(mainFlowSource) {
        return `
let __tick = 0;
let __ctx = {
  podName: null,
  nodeName: null,
  tick: 0,
  memory: {}
};

function emit(type, payload) {
  self.postMessage({ type, payload, at: Date.now() });
}

self.mainFlow = {
  onStart: function () { return { started: true }; },
  onTick: function () { return { tick: __tick }; },
  onStop: function () { return { stopped: true }; }
};

try {
${mainFlowSource}
} catch (err) {
  emit('runtimeError', { message: 'Error while loading main.flow.js: ' + String(err) });
}

self.onmessage = async function (event) {
  const cmd = event.data && event.data.cmd;

  if (cmd === 'start') {
    __ctx.podName = event.data.podName;
    __ctx.nodeName = event.data.nodeName;
    __ctx.tick = __tick;

    try {
      const result = await Promise.resolve(self.mainFlow.onStart(__ctx));
      emit('started', { result });
    } catch (err) {
      emit('runtimeError', { message: 'onStart failed: ' + String(err) });
    }
    return;
  }

  if (cmd === 'tick') {
    __tick += 1;
    __ctx.tick = __tick;
    try {
      const result = await Promise.resolve(self.mainFlow.onTick(__ctx));
      emit('tick', { tick: __tick, result: result });
    } catch (err) {
      emit('runtimeError', { message: 'onTick failed: ' + String(err), tick: __tick });
    }
    return;
  }

  if (cmd === 'stop') {
    try {
      const result = await Promise.resolve(self.mainFlow.onStop(__ctx));
      emit('stopped', { result });
    } catch (err) {
      emit('runtimeError', { message: 'onStop failed: ' + String(err) });
    }
    self.close();
  }
};`;
    }

    function attachWorkerEvents(workloadId, worker) {
        worker.onmessage = function (event) {
            const workload = state.workloads.find(function (item) {
                return item.id === workloadId;
            });
            if (!workload) {
                return;
            }

            const type = event.data && event.data.type;
            const payload = event.data && event.data.payload;

            if (type === 'started') {
                workload.status = 'Running';
                workload.lastOutput = JSON.stringify(payload && payload.result);
                addEvent('worker', `${workload.name} started on ${workload.node}`, 'info');
            } else if (type === 'tick') {
                workload.tickCount += 1;
                workload.lastOutput = JSON.stringify(payload && payload.result);
                addEvent('tick', `${workload.name} tick ${payload.tick} executed`, 'info');
            } else if (type === 'stopped') {
                workload.status = 'Stopped';
                workload.lastOutput = JSON.stringify(payload && payload.result);
                workerHandles.delete(workload.id);
                addEvent('worker', `${workload.name} stopped`, 'warn');
            } else if (type === 'runtimeError') {
                workload.status = 'Error';
                workload.lastOutput = payload && payload.message ? payload.message : 'Unknown error';
                addEvent('runtimeError', `${workload.name}: ${workload.lastOutput}`, 'error');
            }

            saveState();
            renderAll();
        };

        worker.onerror = function (error) {
            const workload = state.workloads.find(function (item) {
                return item.id === workloadId;
            });
            if (workload) {
                workload.status = 'Error';
                workload.lastOutput = String(error.message || error);
                addEvent('runtimeError', `${workload.name}: ${workload.lastOutput}`, 'error');
                saveState();
                renderAll();
            }
        };
    }

    function startWorkerForWorkload(workload) {
        const artifact = getArtifactByRef(workload.artifactRef);
        if (!artifact) {
            workload.status = 'Error';
            workload.lastOutput = 'Artifact not found';
            return;
        }

        const code = createWorkerRuntimeCode(artifact.mainFlowSource);
        const blob = new Blob([code], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        URL.revokeObjectURL(url);

        attachWorkerEvents(workload.id, worker);
        workerHandles.set(workload.id, worker);
        worker.postMessage({ cmd: 'start', podName: workload.name, nodeName: workload.node });
    }

    function stopWorkload(workload) {
        const worker = workerHandles.get(workload.id);
        if (worker) {
            worker.postMessage({ cmd: 'stop' });
        } else {
            workload.status = 'Stopped';
        }
    }

    function bootRunningWorkloads() {
        state.workloads.forEach(function (workload) {
            if (workload.status === 'Running') {
                startWorkerForWorkload(workload);
            }
        });
    }

    function renderTargets() {
        if (state.artifacts.length === 0) {
            artifactRefSelect.innerHTML = '<option value="">Publish an artifact first</option>';
            artifactRefSelect.disabled = true;
        } else {
            artifactRefSelect.disabled = false;
            artifactRefSelect.innerHTML = state.artifacts.map(function (artifact) {
                return `<option value="${artifact.ref}">${artifact.ref}</option>`;
            }).join('');
        }

        if (state.nodes.length === 0) {
            manualNodeSelect.innerHTML = '<option value="">Add a node first</option>';
            manualNodeSelect.disabled = true;
        } else {
            manualNodeSelect.innerHTML = state.nodes.map(function (node) {
                return `<option value="${node.name}">${node.name}</option>`;
            }).join('');
            manualNodeSelect.disabled = scheduleModeSelect.value === 'auto';
        }
    }

    function renderSummary() {
        const running = state.workloads.filter(function (w) { return w.status === 'Running'; }).length;
        const errored = state.workloads.filter(function (w) { return w.status === 'Error'; }).length;

        summaryEl.innerHTML = [
            `<span class="chip">Artifacts: ${state.artifacts.length}</span>`,
            `<span class="chip">Nodes: ${state.nodes.length}</span>`,
            `<span class="chip">Workloads: ${state.workloads.length}</span>`,
            `<span class="chip">Running Workers: ${running}</span>`,
            `<span class="chip">Errors: ${errored}</span>`
        ].join('');
    }

    function renderArtifacts() {
        if (state.artifacts.length === 0) {
            artifactListEl.innerHTML = '<div class="empty">No artifacts published.</div>';
            return;
        }

        artifactListEl.innerHTML = state.artifacts.map(function (artifact) {
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${artifact.ref}</span>
                    <span class="visibility public">main.flow.js</span>
                </div>
                <div class="meta">Updated: ${new Date(artifact.updatedAt).toLocaleString()}</div>
            </article>`;
        }).join('');
    }

    function renderWorkloads() {
        if (state.workloads.length === 0) {
            workloadListEl.innerHTML = '<div class="empty">No workloads launched.</div>';
            return;
        }

        workloadListEl.innerHTML = state.workloads.slice().reverse().map(function (workload) {
            const statusClass = workload.status === 'Running' ? 'public' : 'private';
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${workload.name}</span>
                    <span class="visibility ${statusClass}">${workload.status}</span>
                </div>
                <div class="meta">Artifact: ${workload.artifactRef}</div>
                <div class="meta">Node: ${workload.node}</div>
                <div class="meta">Ticks: ${workload.tickCount}</div>
                <div class="meta">Last Output: ${workload.lastOutput || 'none'}</div>
                <div class="tag-row" style="margin-top:8px;">
                    <button class="pull-btn" data-tick-id="${workload.id}">Tick</button>
                    <button class="pull-btn" data-stop-id="${workload.id}">Stop</button>
                </div>
            </article>`;
        }).join('');

        workloadListEl.querySelectorAll('[data-tick-id]').forEach(function (button) {
            button.addEventListener('click', function () {
                const workload = state.workloads.find(function (item) {
                    return item.id === button.getAttribute('data-tick-id');
                });
                if (!workload || workload.status !== 'Running') {
                    return;
                }
                const worker = workerHandles.get(workload.id);
                if (worker) {
                    worker.postMessage({ cmd: 'tick' });
                }
            });
        });

        workloadListEl.querySelectorAll('[data-stop-id]').forEach(function (button) {
            button.addEventListener('click', function () {
                const workload = state.workloads.find(function (item) {
                    return item.id === button.getAttribute('data-stop-id');
                });
                if (!workload || workload.status !== 'Running') {
                    return;
                }
                stopWorkload(workload);
            });
        });
    }

    function renderNodes() {
        if (state.nodes.length === 0) {
            nodeListEl.innerHTML = '<div class="empty">No nodes registered.</div>';
            return;
        }

        nodeListEl.innerHTML = state.nodes.map(function (node) {
            const used = workerUsage(node.name);
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${node.name}</span>
                    <span class="visibility public">${used}/${node.workerCapacity}</span>
                </div>
                <div class="meta">Worker Capacity: ${node.workerCapacity}</div>
            </article>`;
        }).join('');
    }

    function renderEvents() {
        if (state.events.length === 0) {
            eventListEl.innerHTML = '<div class="empty">No cluster events yet.</div>';
            return;
        }

        eventListEl.innerHTML = state.events.slice(0, 50).map(function (eventItem) {
            return `<article class="repo-card event-card ${eventItem.severity}">
                <div class="repo-title">
                    <span class="repo-fullname">${eventItem.type}</span>
                    <span class="visibility public">${new Date(eventItem.at).toLocaleTimeString()}</span>
                </div>
                <div class="meta">${eventItem.message}</div>
            </article>`;
        }).join('');
    }

    function renderAll() {
        renderTargets();
        renderSummary();
        renderArtifacts();
        renderWorkloads();
        renderNodes();
        renderEvents();
    }

    artifactForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const namespace = artifactForm.namespace.value;
        const artifactName = artifactForm.artifactName.value;
        const revision = artifactForm.revision.value;
        const mainFlowSource = artifactForm.mainFlowSource.value;
        const ref = buildArtifactRef(namespace, artifactName, revision);

        const existing = state.artifacts.find(function (artifact) {
            return artifact.ref === ref;
        });

        if (existing) {
            existing.mainFlowSource = mainFlowSource;
            existing.updatedAt = Date.now();
            addEvent('artifact', `Updated ${ref}`, 'warn');
        } else {
            state.artifacts.unshift({
                ref: ref,
                mainFlowSource: mainFlowSource,
                updatedAt: Date.now()
            });
            addEvent('artifact', `Published ${ref} with main.flow.js`, 'info');
        }

        saveState();
        renderAll();
        artifactForm.reset();
    });

    nodeForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const nodeName = nodeForm.nodeName.value.trim().toLowerCase();
        const workerCapacity = Number(nodeForm.workerCapacity.value);

        const existing = state.nodes.find(function (node) {
            return node.name === nodeName;
        });
        if (existing) {
            existing.workerCapacity = workerCapacity;
            addEvent('node', `Updated node ${nodeName} capacity to ${workerCapacity}`, 'warn');
        } else {
            state.nodes.push({ name: nodeName, workerCapacity: workerCapacity });
            addEvent('node', `Added node ${nodeName}`, 'info');
        }

        saveState();
        renderAll();
        nodeForm.reset();
    });

    workloadForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const artifactRef = workloadForm.artifactRef.value;
        const prefix = workloadForm.prefix.value.trim().toLowerCase();
        const replicas = Number(workloadForm.replicas.value);
        const mode = workloadForm.scheduleMode.value;
        const manualNode = workloadForm.manualNode.value;

        for (let i = 0; i < replicas; i += 1) {
            const targetNode = mode === 'auto' ? pickNode() : manualNode;
            if (!targetNode) {
                addEvent('schedule', `Failed to place ${prefix}-${i + 1}: no node capacity`, 'error');
                continue;
            }

            const node = state.nodes.find(function (item) { return item.name === targetNode; });
            if (!node || workerUsage(targetNode) >= node.workerCapacity) {
                addEvent('schedule', `Failed to place ${prefix}-${i + 1}: node ${targetNode} is full`, 'error');
                continue;
            }

            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const name = `${prefix}-${Math.random().toString(36).slice(2, 6)}`;

            const workload = {
                id: id,
                name: name,
                artifactRef: artifactRef,
                node: targetNode,
                status: 'Running',
                tickCount: 0,
                lastOutput: ''
            };

            state.workloads.push(workload);
            startWorkerForWorkload(workload);
            addEvent('schedule', `Placed ${name} on ${targetNode}`, 'info');
        }

        saveState();
        renderAll();
        workloadForm.reset();
    });

    tickAllBtn.addEventListener('click', function () {
        state.workloads.forEach(function (workload) {
            if (workload.status !== 'Running') {
                return;
            }
            const worker = workerHandles.get(workload.id);
            if (worker) {
                worker.postMessage({ cmd: 'tick' });
            }
        });
    });

    stopAllBtn.addEventListener('click', function () {
        state.workloads.forEach(function (workload) {
            if (workload.status === 'Running') {
                stopWorkload(workload);
            }
        });
        saveState();
        renderAll();
    });

    scheduleModeSelect.addEventListener('change', function () {
        manualNodeSelect.disabled = scheduleModeSelect.value === 'auto';
    });

    bootRunningWorkloads();
    renderAll();
});