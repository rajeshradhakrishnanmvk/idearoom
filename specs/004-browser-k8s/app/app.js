document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = 'browser-cluster-state-v4';

    const artifactForm = document.getElementById('artifact-form');
    const nodeForm = document.getElementById('node-form');
    const policyForm = document.getElementById('policy-form');
    const workloadForm = document.getElementById('workload-form');

    const artifactRefSelect = document.getElementById('artifact-ref');
    const scheduleModeSelect = document.getElementById('schedule-mode');
    const manualNodeSelect = document.getElementById('manual-node');

    const tickAllBtn = document.getElementById('tick-all');
    const stopAllBtn = document.getElementById('stop-all');
    const exportArtifactsBtn = document.getElementById('export-artifacts');
    const importArtifactsBtn = document.getElementById('import-artifacts');
    const artifactImportFile = document.getElementById('artifact-import-file');

    const summaryEl = document.getElementById('cluster-summary');
    const artifactListEl = document.getElementById('artifact-list');
    const workloadListEl = document.getElementById('workload-list');
    const nodeListEl = document.getElementById('node-list');
    const eventListEl = document.getElementById('event-list');
    const logListEl = document.getElementById('log-list');
    const traceListEl = document.getElementById('trace-list');
    const namespacePolicyListEl = document.getElementById('namespace-policy-list');

    const traceFilterWorkload = document.getElementById('trace-filter-workload');
    const traceFilterType = document.getElementById('trace-filter-type');
    const traceFilterText = document.getElementById('trace-filter-text');
    const globalTraceListEl = document.getElementById('global-trace-list');

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
                namespacePolicies: [],
                namespaceAlertState: {},
                workloads: [],
                events: []
            };
        }

        try {
            const parsed = JSON.parse(raw);
            parsed.artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
            parsed.nodes = Array.isArray(parsed.nodes) ? parsed.nodes : defaultNodes();
            parsed.namespacePolicies = Array.isArray(parsed.namespacePolicies) ? parsed.namespacePolicies : [];
            parsed.namespaceAlertState = parsed.namespaceAlertState || {};
            parsed.workloads = Array.isArray(parsed.workloads) ? parsed.workloads : [];
            parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
            parsed.workloads.forEach(normalizeWorkload);
            return parsed;
        } catch (error) {
            return {
                artifacts: [],
                nodes: defaultNodes(),
                namespacePolicies: [],
                namespaceAlertState: {},
                workloads: [],
                events: []
            };
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function addEvent(type, message, severity) {
        state.events.unshift({ at: Date.now(), type: type, message: message, severity: severity || 'info' });
        state.events = state.events.slice(0, 250);
    }

    function addLog(workload, message) {
        const line = `[${new Date().toLocaleTimeString()}] ${message}`;
        workload.logs.unshift(line);
        workload.logs = workload.logs.slice(0, 40);
    }

    function addTrace(workload, type, message) {
        workload.trace.unshift({ at: Date.now(), type: type, message: message });
        workload.trace = workload.trace.slice(0, 80);
    }

    function namespaceFromArtifactRef(ref) {
        return String(ref || '').split('/')[0] || 'default';
    }

    function normalizeWorkload(workload) {
        workload.status = workload.status || 'Running';
        workload.tickCount = workload.tickCount || 0;
        workload.lastOutput = workload.lastOutput || '';
        workload.tickTimeoutMs = workload.tickTimeoutMs || 1000;
        workload.memorySoftQuotaKb = workload.memorySoftQuotaKb || 256;
        workload.memoryEstimateBytes = workload.memoryEstimateBytes || 0;
        workload.memoryWarningCount = workload.memoryWarningCount || 0;
        workload.overQuota = Boolean(workload.overQuota);
        workload.namespace = workload.namespace || namespaceFromArtifactRef(workload.artifactRef);
        workload.logs = Array.isArray(workload.logs) ? workload.logs : [];
        workload.trace = Array.isArray(workload.trace) ? workload.trace : [];
        return workload;
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
            .filter(function (entry) { return entry.free >= 1; })
            .sort(function (a, b) { return b.score - a.score; });

        return candidates.length ? candidates[0].node.name : null;
    }

    function getArtifactByRef(ref) {
        return state.artifacts.find(function (artifact) {
            return artifact.ref === ref;
        });
    }

    function getNamespacePolicy(namespace) {
        return state.namespacePolicies.find(function (policy) {
            return policy.namespace === namespace;
        });
    }

    function namespaceStats(namespace) {
        const running = state.workloads.filter(function (w) {
            return w.namespace === namespace && w.status === 'Running';
        });
        const runningCount = running.length;
        const configuredQuotaKb = running.reduce(function (acc, w) {
            return acc + w.memorySoftQuotaKb;
        }, 0);
        const actualMemoryBytes = running.reduce(function (acc, w) {
            return acc + w.memoryEstimateBytes;
        }, 0);
        return {
            runningCount: runningCount,
            configuredQuotaKb: configuredQuotaKb,
            actualMemoryBytes: actualMemoryBytes
        };
    }

    function canScheduleNamespace(namespace, memorySoftQuotaKb) {
        const policy = getNamespacePolicy(namespace);
        if (!policy) {
            return { ok: true };
        }

        const stats = namespaceStats(namespace);
        if ((stats.runningCount + 1) > policy.maxWorkers) {
            return { ok: false, reason: `namespace ${namespace} max workers exceeded (${policy.maxWorkers})` };
        }
        if ((stats.configuredQuotaKb + memorySoftQuotaKb) > policy.maxMemoryKb) {
            return { ok: false, reason: `namespace ${namespace} memory quota exceeded (${policy.maxMemoryKb}KB)` };
        }
        return { ok: true };
    }

    function checkNamespaceRuntimeQuota(namespace) {
        const policy = getNamespacePolicy(namespace);
        if (!policy) {
            return;
        }
        const stats = namespaceStats(namespace);
        const over = stats.actualMemoryBytes > (policy.maxMemoryKb * 1024);
        const prev = Boolean(state.namespaceAlertState[namespace]);

        if (over && !prev) {
            state.namespaceAlertState[namespace] = true;
            addEvent('namespaceWarn', `namespace ${namespace} runtime memory exceeded policy`, 'warn');
        } else if (!over && prev) {
            state.namespaceAlertState[namespace] = false;
            addEvent('namespaceRecover', `namespace ${namespace} runtime memory returned below policy`, 'info');
        }
    }

    function updateMemoryQuotaState(workload, memoryBytes) {
        workload.memoryEstimateBytes = memoryBytes;
        const quotaBytes = workload.memorySoftQuotaKb * 1024;
        const isOver = memoryBytes > quotaBytes;

        if (isOver && !workload.overQuota) {
            workload.overQuota = true;
            workload.memoryWarningCount += 1;
            addLog(workload, `memory warning: ${memoryBytes} bytes > ${quotaBytes} bytes`);
            addTrace(workload, 'memoryWarn', `over quota by ${memoryBytes - quotaBytes} bytes`);
            addEvent('memoryWarn', `${workload.name} exceeded memory soft quota`, 'warn');
        } else if (!isOver && workload.overQuota) {
            workload.overQuota = false;
            addLog(workload, `memory recovered: ${memoryBytes} bytes`);
            addTrace(workload, 'memoryRecover', 'back under quota');
            addEvent('memoryRecover', `${workload.name} returned under memory soft quota`, 'info');
        }

        checkNamespaceRuntimeQuota(workload.namespace);
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

function estimateMemoryBytes() {
  try {
    return new TextEncoder().encode(JSON.stringify(__ctx.memory)).length;
  } catch (err) {
    return 0;
  }
}

async function runWithTimeout(fn, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise(function (_, reject) {
    timeoutId = setTimeout(function () {
      reject(new Error(label + ' timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve(fn()), timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

self.mainFlow = {
  onStart: function () { return { started: true }; },
  onTick: function () { return { tick: __tick }; },
  onStop: function () { return { stopped: true }; }
};

try {
${mainFlowSource}
} catch (err) {
  emit('runtimeError', { message: 'Error while loading main.flow.js: ' + String(err), fatal: true });
}

self.onmessage = async function (event) {
  const cmd = event.data && event.data.cmd;

  if (cmd === 'start') {
    __ctx.podName = event.data.podName;
    __ctx.nodeName = event.data.nodeName;
    __ctx.tick = __tick;
    const timeoutMs = event.data.timeoutMs || 1000;

    try {
      const result = await runWithTimeout(function () {
        return self.mainFlow.onStart(__ctx);
      }, timeoutMs, 'onStart');
      emit('started', { result, memoryBytes: estimateMemoryBytes() });
    } catch (err) {
      emit('runtimeError', { message: 'onStart failed: ' + String(err), fatal: true });
      self.close();
    }
    return;
  }

  if (cmd === 'tick') {
    __tick += 1;
    __ctx.tick = __tick;
    const timeoutMs = event.data.timeoutMs || 1000;

    try {
      const result = await runWithTimeout(function () {
        return self.mainFlow.onTick(__ctx);
      }, timeoutMs, 'onTick');
      emit('tick', { tick: __tick, result: result, memoryBytes: estimateMemoryBytes() });
    } catch (err) {
      emit('runtimeError', { message: 'onTick failed: ' + String(err), tick: __tick, fatal: true });
      self.close();
    }
    return;
  }

  if (cmd === 'stop') {
    const timeoutMs = event.data.timeoutMs || 1000;
    try {
      const result = await runWithTimeout(function () {
        return self.mainFlow.onStop(__ctx);
      }, timeoutMs, 'onStop');
      emit('stopped', { result, memoryBytes: estimateMemoryBytes() });
    } catch (err) {
      emit('runtimeError', { message: 'onStop failed: ' + String(err), fatal: true });
    }
    self.close();
  }
};`;
    }

    function hardFailWorkload(workload, reason) {
        workload.status = 'Error';
        workload.lastOutput = reason;
        addLog(workload, `HARD FAIL: ${reason}`);
        addTrace(workload, 'error', reason);
        const handle = workerHandles.get(workload.id);
        if (handle) {
            handle.terminate();
            workerHandles.delete(workload.id);
        }
        addEvent('runtimeError', `${workload.name}: ${reason}`, 'error');
        checkNamespaceRuntimeQuota(workload.namespace);
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
            const memoryBytes = payload && payload.memoryBytes ? payload.memoryBytes : 0;

            if (type === 'started') {
                workload.status = 'Running';
                workload.lastOutput = JSON.stringify(payload && payload.result);
                updateMemoryQuotaState(workload, memoryBytes);
                addLog(workload, `started on ${workload.node}`);
                addTrace(workload, 'start', `worker started on ${workload.node}`);
                addEvent('worker', `${workload.name} started on ${workload.node}`, 'info');
            } else if (type === 'tick') {
                workload.tickCount += 1;
                workload.lastOutput = JSON.stringify(payload && payload.result);
                updateMemoryQuotaState(workload, memoryBytes);
                addLog(workload, `tick ${payload.tick}: ${workload.lastOutput}`);
                addTrace(workload, 'tick', `tick ${payload.tick}`);
                addEvent('tick', `${workload.name} tick ${payload.tick} executed`, 'info');
            } else if (type === 'stopped') {
                workload.status = 'Stopped';
                workload.lastOutput = JSON.stringify(payload && payload.result);
                updateMemoryQuotaState(workload, memoryBytes);
                addLog(workload, `stopped: ${workload.lastOutput}`);
                addTrace(workload, 'stop', 'worker stopped');
                workerHandles.delete(workload.id);
                addEvent('worker', `${workload.name} stopped`, 'warn');
            } else if (type === 'runtimeError') {
                const message = payload && payload.message ? payload.message : 'Unknown error';
                hardFailWorkload(workload, message);
            }

            saveState();
            renderAll();
        };

        worker.onerror = function (error) {
            const workload = state.workloads.find(function (item) {
                return item.id === workloadId;
            });
            if (workload) {
                hardFailWorkload(workload, String(error.message || error));
                saveState();
                renderAll();
            }
        };
    }

    function startWorkerForWorkload(workload) {
        const artifact = getArtifactByRef(workload.artifactRef);
        if (!artifact) {
            hardFailWorkload(workload, 'Artifact not found');
            return;
        }

        const code = createWorkerRuntimeCode(artifact.mainFlowSource);
        const blob = new Blob([code], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        URL.revokeObjectURL(url);

        attachWorkerEvents(workload.id, worker);
        workerHandles.set(workload.id, worker);
        worker.postMessage({
            cmd: 'start',
            podName: workload.name,
            nodeName: workload.node,
            timeoutMs: workload.tickTimeoutMs
        });
    }

    function stopWorkload(workload) {
        const worker = workerHandles.get(workload.id);
        if (worker) {
            worker.postMessage({ cmd: 'stop', timeoutMs: workload.tickTimeoutMs });
        } else {
            workload.status = 'Stopped';
            addLog(workload, 'stopped without active worker handle');
            addTrace(workload, 'stop', 'stopped without handle');
            checkNamespaceRuntimeQuota(workload.namespace);
        }
    }

    function bootRunningWorkloads() {
        state.workloads.forEach(function (workload) {
            normalizeWorkload(workload);
            if (workload.status === 'Running') {
                startWorkerForWorkload(workload);
            }
        });
    }

    function fallbackHash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i += 1) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash >>> 0;
        }
        return `fallback-${hash.toString(16)}`;
    }

    async function computeSignature(text) {
        if (window.crypto && window.crypto.subtle && window.TextEncoder) {
            const bytes = new TextEncoder().encode(text);
            const digest = await window.crypto.subtle.digest('SHA-256', bytes);
            const hex = Array.from(new Uint8Array(digest)).map(function (b) {
                return b.toString(16).padStart(2, '0');
            }).join('');
            return `sha256-${hex}`;
        }
        return fallbackHash(text);
    }

    async function exportArtifacts() {
        const signedArtifacts = [];
        for (let i = 0; i < state.artifacts.length; i += 1) {
            const artifact = state.artifacts[i];
            const signature = await computeSignature(`${artifact.ref}\n${artifact.mainFlowSource}`);
            signedArtifacts.push({
                ref: artifact.ref,
                mainFlowSource: artifact.mainFlowSource,
                updatedAt: artifact.updatedAt,
                signature: signature
            });
        }

        const payload = {
            exportedAt: Date.now(),
            version: 3,
            artifacts: signedArtifacts
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'browser-cluster-artifacts.signed.json';
        a.click();
        URL.revokeObjectURL(url);

        addEvent('artifact', 'Exported signed artifact bundle', 'info');
        saveState();
        renderAll();
    }

    function importArtifactsFromFile(file) {
        const reader = new FileReader();
        reader.onload = async function () {
            try {
                const parsed = JSON.parse(String(reader.result));
                const incoming = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
                let imported = 0;
                let rejected = 0;

                for (let i = 0; i < incoming.length; i += 1) {
                    const artifact = incoming[i];
                    if (!artifact.ref || !artifact.mainFlowSource || !artifact.signature) {
                        rejected += 1;
                        continue;
                    }

                    const expected = await computeSignature(`${artifact.ref}\n${artifact.mainFlowSource}`);
                    if (expected !== artifact.signature) {
                        rejected += 1;
                        continue;
                    }

                    const existing = state.artifacts.find(function (item) {
                        return item.ref === artifact.ref;
                    });
                    if (existing) {
                        existing.mainFlowSource = artifact.mainFlowSource;
                        existing.updatedAt = Date.now();
                    } else {
                        state.artifacts.unshift({
                            ref: artifact.ref,
                            mainFlowSource: artifact.mainFlowSource,
                            updatedAt: Date.now()
                        });
                    }
                    imported += 1;
                }

                addEvent('artifact', `Imported ${imported} signed artifacts, rejected ${rejected} invalid entries`, rejected > 0 ? 'warn' : 'info');
                saveState();
                renderAll();
            } catch (error) {
                addEvent('artifact', `Import failed: ${String(error)}`, 'error');
                saveState();
                renderAll();
            }
        };
        reader.readAsText(file);
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
        const overQuota = state.workloads.filter(function (w) { return w.overQuota; }).length;

        summaryEl.innerHTML = [
            `<span class="chip">Artifacts: ${state.artifacts.length}</span>`,
            `<span class="chip">Nodes: ${state.nodes.length}</span>`,
            `<span class="chip">Policies: ${state.namespacePolicies.length}</span>`,
            `<span class="chip">Workloads: ${state.workloads.length}</span>`,
            `<span class="chip">Running Workers: ${running}</span>`,
            `<span class="chip">Memory Warnings: ${overQuota}</span>`,
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
            const quotaBytes = workload.memorySoftQuotaKb * 1024;
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${workload.name}</span>
                    <span class="visibility ${statusClass}">${workload.status}</span>
                </div>
                <div class="meta">Namespace: ${workload.namespace}</div>
                <div class="meta">Artifact: ${workload.artifactRef}</div>
                <div class="meta">Node: ${workload.node}</div>
                <div class="meta">Ticks: ${workload.tickCount}</div>
                <div class="meta">Timeout: ${workload.tickTimeoutMs}ms</div>
                <div class="meta">Memory: ${workload.memoryEstimateBytes} / ${quotaBytes} bytes (${workload.memorySoftQuotaKb}KB quota)</div>
                <div class="meta">Memory warnings: ${workload.memoryWarningCount}</div>
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
                    worker.postMessage({ cmd: 'tick', timeoutMs: workload.tickTimeoutMs });
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

    function renderNamespacePolicies() {
        if (state.namespacePolicies.length === 0) {
            namespacePolicyListEl.innerHTML = '<div class="empty">No namespace policies configured.</div>';
            return;
        }

        namespacePolicyListEl.innerHTML = state.namespacePolicies.map(function (policy) {
            const stats = namespaceStats(policy.namespace);
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${policy.namespace}</span>
                    <span class="visibility public">policy</span>
                </div>
                <div class="meta">Workers: ${stats.runningCount}/${policy.maxWorkers}</div>
                <div class="meta">Configured memory quotas: ${stats.configuredQuotaKb}/${policy.maxMemoryKb} KB</div>
                <div class="meta">Runtime memory: ${stats.actualMemoryBytes} / ${policy.maxMemoryKb * 1024} bytes</div>
            </article>`;
        }).join('');
    }

    function renderEvents() {
        if (state.events.length === 0) {
            eventListEl.innerHTML = '<div class="empty">No cluster events yet.</div>';
            return;
        }

        eventListEl.innerHTML = state.events.slice(0, 60).map(function (eventItem) {
            return `<article class="repo-card event-card ${eventItem.severity}">
                <div class="repo-title">
                    <span class="repo-fullname">${eventItem.type}</span>
                    <span class="visibility public">${new Date(eventItem.at).toLocaleTimeString()}</span>
                </div>
                <div class="meta">${eventItem.message}</div>
            </article>`;
        }).join('');
    }

    function renderLogs() {
        if (state.workloads.length === 0) {
            logListEl.innerHTML = '<div class="empty">No workload logs yet.</div>';
            return;
        }

        logListEl.innerHTML = state.workloads.slice().reverse().map(function (workload) {
            const lines = workload.logs.length ? workload.logs.slice(0, 10).join('\n') : 'No log lines yet.';
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${workload.name}</span>
                    <span class="visibility public">${workload.status}</span>
                </div>
                <pre class="log-block">${lines}</pre>
            </article>`;
        }).join('');
    }

    function renderTrace() {
        if (state.workloads.length === 0) {
            traceListEl.innerHTML = '<div class="empty">No trace events yet.</div>';
            return;
        }

        traceListEl.innerHTML = state.workloads.slice().reverse().map(function (workload) {
            const lines = workload.trace.length
                ? workload.trace.slice(0, 8).map(function (entry) {
                    return `[${new Date(entry.at).toLocaleTimeString()}] ${entry.type}: ${entry.message}`;
                }).join('\n')
                : 'No trace entries yet.';
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${workload.name}</span>
                    <span class="visibility public">trace</span>
                </div>
                <pre class="log-block">${lines}</pre>
            </article>`;
        }).join('');
    }

    function renderGlobalTraceExplorer() {
        const workloadFilter = String(traceFilterWorkload.value || '').trim().toLowerCase();
        const typeFilter = String(traceFilterType.value || '').trim();
        const textFilter = String(traceFilterText.value || '').trim().toLowerCase();

        const rows = state.workloads.flatMap(function (workload) {
            return workload.trace.map(function (entry) {
                return {
                    workload: workload.name,
                    namespace: workload.namespace,
                    at: entry.at,
                    type: entry.type,
                    message: entry.message
                };
            });
        });

        const filtered = rows
            .filter(function (row) {
                if (workloadFilter && !row.workload.toLowerCase().includes(workloadFilter)) {
                    return false;
                }
                if (typeFilter && row.type !== typeFilter) {
                    return false;
                }
                if (textFilter && !`${row.message}`.toLowerCase().includes(textFilter)) {
                    return false;
                }
                return true;
            })
            .sort(function (a, b) {
                return b.at - a.at;
            })
            .slice(0, 80);

        if (filtered.length === 0) {
            globalTraceListEl.innerHTML = '<div class="empty">No trace entries match current filters.</div>';
            return;
        }

        globalTraceListEl.innerHTML = filtered.map(function (row) {
            return `<article class="repo-card">
                <div class="repo-title">
                    <span class="repo-fullname">${row.workload}</span>
                    <span class="visibility public">${row.type}</span>
                </div>
                <div class="meta">Namespace: ${row.namespace}</div>
                <div class="meta">Time: ${new Date(row.at).toLocaleTimeString()}</div>
                <div class="meta">${row.message}</div>
            </article>`;
        }).join('');
    }

    function renderAll() {
        renderTargets();
        renderSummary();
        renderArtifacts();
        renderWorkloads();
        renderNodes();
        renderNamespacePolicies();
        renderEvents();
        renderLogs();
        renderTrace();
        renderGlobalTraceExplorer();
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
            state.artifacts.unshift({ ref: ref, mainFlowSource: mainFlowSource, updatedAt: Date.now() });
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

    policyForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const namespace = policyForm.namespace.value.trim().toLowerCase();
        const maxWorkers = Number(policyForm.maxWorkers.value);
        const maxMemoryKb = Number(policyForm.maxMemoryKb.value);

        const existing = getNamespacePolicy(namespace);
        if (existing) {
            existing.maxWorkers = maxWorkers;
            existing.maxMemoryKb = maxMemoryKb;
            addEvent('policy', `Updated namespace policy for ${namespace}`, 'warn');
        } else {
            state.namespacePolicies.push({ namespace: namespace, maxWorkers: maxWorkers, maxMemoryKb: maxMemoryKb });
            addEvent('policy', `Created namespace policy for ${namespace}`, 'info');
        }

        checkNamespaceRuntimeQuota(namespace);
        saveState();
        renderAll();
        policyForm.reset();
    });

    workloadForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const artifactRef = workloadForm.artifactRef.value;
        const prefix = workloadForm.prefix.value.trim().toLowerCase();
        const replicas = Number(workloadForm.replicas.value);
        const mode = workloadForm.scheduleMode.value;
        const manualNode = workloadForm.manualNode.value;
        const tickTimeoutMs = Number(workloadForm.tickTimeoutMs.value);
        const memorySoftQuotaKb = Number(workloadForm.memorySoftQuotaKb.value);
        const namespace = namespaceFromArtifactRef(artifactRef);

        for (let i = 0; i < replicas; i += 1) {
            const policyCheck = canScheduleNamespace(namespace, memorySoftQuotaKb);
            if (!policyCheck.ok) {
                addEvent('policy', `Denied ${prefix}-${i + 1}: ${policyCheck.reason}`, 'error');
                continue;
            }

            const targetNode = mode === 'auto' ? pickNode() : manualNode;
            if (!targetNode) {
                addEvent('schedule', `Failed to place ${prefix}-${i + 1}: no node capacity`, 'error');
                continue;
            }

            const node = state.nodes.find(function (item) {
                return item.name === targetNode;
            });
            if (!node || workerUsage(targetNode) >= node.workerCapacity) {
                addEvent('schedule', `Failed to place ${prefix}-${i + 1}: node ${targetNode} is full`, 'error');
                continue;
            }

            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const name = `${prefix}-${Math.random().toString(36).slice(2, 6)}`;

            const workload = normalizeWorkload({
                id: id,
                name: name,
                namespace: namespace,
                artifactRef: artifactRef,
                node: targetNode,
                status: 'Running',
                tickCount: 0,
                lastOutput: '',
                tickTimeoutMs: tickTimeoutMs,
                memorySoftQuotaKb: memorySoftQuotaKb,
                memoryEstimateBytes: 0,
                memoryWarningCount: 0,
                overQuota: false,
                logs: [],
                trace: []
            });

            addLog(workload, `scheduled to ${targetNode}`);
            addTrace(workload, 'schedule', `placed on ${targetNode}`);
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
                worker.postMessage({ cmd: 'tick', timeoutMs: workload.tickTimeoutMs });
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

    exportArtifactsBtn.addEventListener('click', function () {
        exportArtifacts();
    });

    importArtifactsBtn.addEventListener('click', function () {
        artifactImportFile.click();
    });

    artifactImportFile.addEventListener('change', function () {
        const file = artifactImportFile.files && artifactImportFile.files[0];
        if (!file) {
            return;
        }
        importArtifactsFromFile(file);
        artifactImportFile.value = '';
    });

    scheduleModeSelect.addEventListener('change', function () {
        manualNodeSelect.disabled = scheduleModeSelect.value === 'auto';
    });

    [traceFilterWorkload, traceFilterType, traceFilterText].forEach(function (el) {
        el.addEventListener('input', renderGlobalTraceExplorer);
        el.addEventListener('change', renderGlobalTraceExplorer);
    });

    bootRunningWorkloads();
    renderAll();
});