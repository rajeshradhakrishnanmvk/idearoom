document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = 'artifact-mesh-state-v1';
    const familyForm = document.getElementById('family-form');
    const artifactForm = document.getElementById('artifact-form');
    const runtimeForm = document.getElementById('runtime-form');
    const nodeForm = document.getElementById('node-form');
    const serviceForm = document.getElementById('service-form');
    const familyTarget = document.getElementById('family-target');
    const artifactRef = document.getElementById('artifact-ref');
    const runtimeNode = document.getElementById('runtime-node');
    const scheduleMode = document.getElementById('schedule-mode');
    const searchInput = document.getElementById('search-input');
    const meshSummary = document.getElementById('mesh-summary');
    const meshList = document.getElementById('mesh-list');
    const runtimeList = document.getElementById('runtime-list');
    const serviceList = document.getElementById('service-list');
    const nodeList = document.getElementById('node-list');
    const eventList = document.getElementById('event-list');

    const state = loadState();

    function baseNodes() {
        return [
            { name: 'node-a', moduleBudget: 64, unitCapacity: 8 },
            { name: 'node-b', moduleBudget: 48, unitCapacity: 6 },
            { name: 'node-c', moduleBudget: 32, unitCapacity: 4 }
        ];
    }

    function loadState() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {
                families: [],
                runtimeUnits: [],
                syncEvents: [],
                services: [],
                events: [],
                nodes: baseNodes()
            };
        }

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed.families)) {
                parsed.families = [];
            }
            if (!Array.isArray(parsed.runtimeUnits)) {
                parsed.runtimeUnits = [];
            }
            if (!Array.isArray(parsed.syncEvents)) {
                parsed.syncEvents = [];
            }
            if (!Array.isArray(parsed.services)) {
                parsed.services = [];
            }
            if (!Array.isArray(parsed.events)) {
                parsed.events = [];
            }
            if (!Array.isArray(parsed.nodes)) {
                parsed.nodes = baseNodes();
            }
            return parsed;
        } catch (error) {
            return {
                families: [],
                runtimeUnits: [],
                syncEvents: [],
                services: [],
                events: [],
                nodes: baseNodes()
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
        state.events = state.events.slice(0, 120);
    }

    function buildFamilyRef(domain, family) {
        return `${domain.trim().toLowerCase()}/${family.trim().toLowerCase()}`;
    }

    function buildArtifactRef(familyRef, revision) {
        return `${familyRef}@${revision.trim().toLowerCase()}`;
    }

    function allArtifacts() {
        return state.families.flatMap(function (family) {
            return family.artifacts.map(function (artifact) {
                return {
                    familyRef: family.ref,
                    policy: family.policy,
                    revision: artifact.revision,
                    moduleCount: artifact.moduleCount,
                    entrypoint: artifact.entrypoint,
                    artifactRef: buildArtifactRef(family.ref, artifact.revision)
                };
            });
        });
    }

    function findArtifactByRef(targetRef) {
        for (let i = 0; i < state.families.length; i += 1) {
            const family = state.families[i];
            for (let j = 0; j < family.artifacts.length; j += 1) {
                const artifact = family.artifacts[j];
                if (buildArtifactRef(family.ref, artifact.revision) === targetRef) {
                    return { family: family, artifact: artifact };
                }
            }
        }
        return null;
    }

    function usageForNode(nodeName) {
        return state.runtimeUnits.reduce(function (acc, unit) {
            if (unit.node !== nodeName || unit.status !== 'Running') {
                return acc;
            }
            return {
                units: acc.units + 1,
                modules: acc.modules + (unit.moduleCount || 1)
            };
        }, { units: 0, modules: 0 });
    }

    function pickBestNode(requiredModules) {
        const candidates = state.nodes
            .map(function (node) {
                const usage = usageForNode(node.name);
                const moduleHeadroom = node.moduleBudget - usage.modules;
                const unitHeadroom = node.unitCapacity - usage.units;
                const canFit = moduleHeadroom >= requiredModules && unitHeadroom >= 1;
                const score = (moduleHeadroom * 2) + unitHeadroom;
                return { node: node, canFit: canFit, score: score };
            })
            .filter(function (entry) {
                return entry.canFit;
            })
            .sort(function (a, b) {
                return b.score - a.score;
            });

        return candidates.length > 0 ? candidates[0].node.name : null;
    }

    function renderTargets() {
        if (state.families.length === 0) {
            familyTarget.innerHTML = '<option value="">Create a family first</option>';
            familyTarget.disabled = true;
        } else {
            familyTarget.disabled = false;
            familyTarget.innerHTML = state.families
                .map(function (family) {
                    return `<option value="${family.ref}">${family.ref}</option>`;
                })
                .join('');
        }

        const artifacts = allArtifacts();
        if (artifacts.length === 0) {
            artifactRef.innerHTML = '<option value="">Publish an artifact first</option>';
            artifactRef.disabled = true;
        } else {
            artifactRef.disabled = false;
            artifactRef.innerHTML = artifacts
                .map(function (artifact) {
                    return `<option value="${artifact.artifactRef}">${artifact.artifactRef}</option>`;
                })
                .join('');
        }

        if (state.nodes.length === 0) {
            runtimeNode.innerHTML = '<option value="">Add a node first</option>';
            runtimeNode.disabled = true;
        } else {
            runtimeNode.disabled = false;
            runtimeNode.innerHTML = state.nodes
                .map(function (node) {
                    return `<option value="${node.name}">${node.name}</option>`;
                })
                .join('');
        }
    }

    function matchesQuery(family, query) {
        const q = query.toLowerCase();
        if (family.ref.includes(q) || family.policy.includes(q)) {
            return true;
        }
        return family.artifacts.some(function (artifact) {
            return artifact.revision.includes(q) || artifact.entrypoint.includes(q);
        });
    }

    function renderSummary(filteredFamilies) {
        const familyCount = filteredFamilies.length;
        const artifactCount = filteredFamilies.reduce(function (acc, family) {
            return acc + family.artifacts.length;
        }, 0);
        const domainCount = new Set(filteredFamilies.map(function (family) {
            return family.domain;
        })).size;

        meshSummary.innerHTML = [
            `<span class="chip">Families: ${familyCount}</span>`,
            `<span class="chip">Artifacts: ${artifactCount}</span>`,
            `<span class="chip">Domains: ${domainCount}</span>`,
            `<span class="chip">Runtime Units: ${state.runtimeUnits.length}</span>`,
            `<span class="chip">Sync Events: ${state.syncEvents.length}</span>`,
            `<span class="chip">Nodes: ${state.nodes.length}</span>`,
            `<span class="chip">Services: ${state.services.length}</span>`
        ].join('');
    }

    function renderSyncHistory() {
        if (state.syncEvents.length === 0) {
            return '<div class="meta">No artifact sync events.</div>';
        }

        return `<div class="pull-history">${state.syncEvents
            .slice(0, 4)
            .map(function (event) {
                return `<div class="meta">Synced ${event.artifactRef} at ${new Date(event.at).toLocaleString()}</div>`;
            })
            .join('')}</div>`;
    }

    function renderFamilies() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = state.families.filter(function (family) {
            if (!query) {
                return true;
            }
            return matchesQuery(family, query);
        });

        renderSummary(filtered);

        if (filtered.length === 0) {
            meshList.innerHTML = '<div class="empty">No artifact families match this filter.</div>';
            return;
        }

        meshList.innerHTML = filtered
            .map(function (family) {
                const policyClass = family.policy === 'restricted' ? 'private' : 'public';
                const artifacts = family.artifacts.length === 0
                    ? '<span class="tag">No artifacts published</span>'
                    : family.artifacts
                        .map(function (artifact) {
                            const ref = buildArtifactRef(family.ref, artifact.revision);
                            return `<div class="tag-row"><span class="tag">${ref} • modules ${artifact.moduleCount} • ${artifact.entrypoint}</span><button class="pull-btn" data-artifact-ref="${ref}">Sync</button></div>`;
                        })
                        .join('');

                return `
                    <article class="repo-card">
                        <div class="repo-title">
                            <span class="repo-fullname">${family.ref}</span>
                            <span class="visibility ${policyClass}">${family.policy}</span>
                        </div>
                        <div class="tag-list">${artifacts}</div>
                        ${renderSyncHistory()}
                        <div class="meta">Last update: ${family.updatedAt ? new Date(family.updatedAt).toLocaleString() : 'N/A'}</div>
                    </article>
                `;
            })
            .join('');

        meshList.querySelectorAll('.pull-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const ref = button.getAttribute('data-artifact-ref');
                state.syncEvents.unshift({ artifactRef: ref, at: Date.now() });
                state.syncEvents = state.syncEvents.slice(0, 40);
                addEvent('sync', `Artifact ${ref} synced into mesh cache`, 'info');
                saveState();
                alert(`Artifact synced: ${ref}\n\nJS bootstrap:\nawait artifactMesh.sync('${ref}')`);
                renderFamilies();
                renderEvents();
            });
        });
    }

    function renderRuntimeUnits() {
        if (state.runtimeUnits.length === 0) {
            runtimeList.innerHTML = '<div class="empty">No runtime units started yet.</div>';
            return;
        }

        runtimeList.innerHTML = state.runtimeUnits
            .slice()
            .reverse()
            .map(function (unit) {
                return `
                    <article class="repo-card">
                        <div class="repo-title">
                            <span class="repo-fullname">${unit.name}</span>
                            <span class="visibility ${unit.status === 'Running' ? 'public' : 'private'}">${unit.status}</span>
                        </div>
                        <div class="meta">Artifact: ${unit.artifactRef}</div>
                        <div class="meta">Node: ${unit.node}</div>
                        <div class="meta">Modules: ${unit.moduleCount || 1}</div>
                        <div class="meta">Scheduled by: ${unit.schedulingMode || 'manual'}</div>
                        <div class="meta">Probe: every ${unit.probeIntervalSec || 15}s, threshold ${unit.failureThreshold || 3}</div>
                        <div class="meta">Restart policy: ${unit.restartPolicy || 'on-failure'} | Restarts: ${unit.restartCount || 0}</div>
                        <div class="meta">Started: ${new Date(unit.startedAt).toLocaleString()}</div>
                        <div class="tag-row" style="margin-top:8px;">
                            <button class="pull-btn" data-probe-unit="${unit.name}">Probe Tick</button>
                            <button class="pull-btn" data-stop-unit="${unit.name}">Stop</button>
                        </div>
                    </article>
                `;
            })
            .join('');

        runtimeList.querySelectorAll('[data-probe-unit]').forEach(function (button) {
            button.addEventListener('click', function () {
                const targetName = button.getAttribute('data-probe-unit');
                const targetUnit = state.runtimeUnits.find(function (item) {
                    return item.name === targetName;
                });

                if (!targetUnit || targetUnit.status !== 'Running') {
                    return;
                }

                const failed = Math.random() < 0.3;
                if (!failed) {
                    targetUnit.consecutiveProbeFailures = 0;
                    addEvent('probe', `Probe passed for ${targetUnit.name}`, 'info');
                    saveState();
                    renderEvents();
                    return;
                }

                targetUnit.consecutiveProbeFailures = (targetUnit.consecutiveProbeFailures || 0) + 1;
                addEvent('probe', `Probe failed for ${targetUnit.name} (${targetUnit.consecutiveProbeFailures}/${targetUnit.failureThreshold})`, 'warn');

                if (targetUnit.consecutiveProbeFailures >= targetUnit.failureThreshold) {
                    if (targetUnit.restartPolicy === 'on-failure') {
                        targetUnit.restartCount = (targetUnit.restartCount || 0) + 1;
                        targetUnit.consecutiveProbeFailures = 0;
                        targetUnit.status = 'Running';
                        addEvent('restart', `Runtime unit ${targetUnit.name} restarted after probe failures`, 'warn');
                    } else {
                        targetUnit.status = 'Failed';
                        addEvent('failure', `Runtime unit ${targetUnit.name} moved to Failed state`, 'error');
                    }
                }

                saveState();
                renderRuntimeUnits();
                renderNodes();
                renderEvents();
            });
        });

        runtimeList.querySelectorAll('[data-stop-unit]').forEach(function (button) {
            button.addEventListener('click', function () {
                const targetName = button.getAttribute('data-stop-unit');
                const targetUnit = state.runtimeUnits.find(function (item) {
                    return item.name === targetName;
                });
                if (!targetUnit) {
                    return;
                }

                targetUnit.status = 'Stopped';
                addEvent('lifecycle', `Runtime unit ${targetUnit.name} stopped by operator`, 'warn');
                saveState();
                renderRuntimeUnits();
                renderNodes();
                renderEvents();
            });
        });
    }

    function renderServices() {
        if (state.services.length === 0) {
            serviceList.innerHTML = '<div class="empty">No services defined.</div>';
            return;
        }

        serviceList.innerHTML = state.services
            .map(function (service) {
                return `
                    <article class="repo-card">
                        <div class="repo-title">
                            <span class="repo-fullname">${service.name}</span>
                            <span class="visibility public">${service.strategy}</span>
                        </div>
                        <div class="meta">Selector token: ${service.selector}</div>
                        <div class="meta">Requests routed: ${service.requestCount || 0}</div>
                        <div class="tag-row" style="margin-top:8px;">
                            <button class="pull-btn" data-route-service="${service.name}">Route Request</button>
                        </div>
                    </article>
                `;
            })
            .join('');

        serviceList.querySelectorAll('[data-route-service]').forEach(function (button) {
            button.addEventListener('click', function () {
                const serviceName = button.getAttribute('data-route-service');
                const service = state.services.find(function (item) {
                    return item.name === serviceName;
                });
                if (!service) {
                    return;
                }

                const candidates = state.runtimeUnits.filter(function (unit) {
                    const isSelected = unit.name.includes(service.selector) || unit.artifactRef.includes(service.selector);
                    return isSelected && unit.status === 'Running';
                });

                if (candidates.length === 0) {
                    addEvent('service', `Service ${service.name} has no running targets for selector ${service.selector}`, 'error');
                    saveState();
                    renderEvents();
                    return;
                }

                let selected = null;
                if (service.strategy === 'random') {
                    selected = candidates[Math.floor(Math.random() * candidates.length)];
                } else {
                    const index = service.cursor || 0;
                    selected = candidates[index % candidates.length];
                    service.cursor = (index + 1) % candidates.length;
                }

                service.requestCount = (service.requestCount || 0) + 1;
                addEvent('service', `Service ${service.name} routed request to ${selected.name} on ${selected.node}`, 'info');
                saveState();
                renderServices();
                renderEvents();
            });
        });
    }

    function renderNodes() {
        if (state.nodes.length === 0) {
            nodeList.innerHTML = '<div class="empty">No mesh nodes registered yet.</div>';
            return;
        }

        nodeList.innerHTML = state.nodes
            .map(function (node) {
                const usage = usageForNode(node.name);
                return `
                    <article class="repo-card">
                        <div class="repo-title">
                            <span class="repo-fullname">${node.name}</span>
                            <span class="visibility public">active</span>
                        </div>
                        <div class="meta">Unit usage: ${usage.units}/${node.unitCapacity}</div>
                        <div class="meta">Module usage: ${usage.modules}/${node.moduleBudget}</div>
                    </article>
                `;
            })
            .join('');
    }

    function renderEvents() {
        if (state.events.length === 0) {
            eventList.innerHTML = '<div class="empty">No control plane events yet.</div>';
            return;
        }

        eventList.innerHTML = state.events
            .slice(0, 30)
            .map(function (eventItem) {
                return `
                    <article class="repo-card event-card ${eventItem.severity}">
                        <div class="repo-title">
                            <span class="repo-fullname">${eventItem.type}</span>
                            <span class="visibility public">${new Date(eventItem.at).toLocaleTimeString()}</span>
                        </div>
                        <div class="meta">${eventItem.message}</div>
                    </article>
                `;
            })
            .join('');
    }

    familyForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const domain = familyForm.domain.value;
        const familyName = familyForm.family.value;
        const policy = familyForm.policy.value;
        const ref = buildFamilyRef(domain, familyName);

        const existing = state.families.some(function (family) {
            return family.ref === ref;
        });

        if (existing) {
            alert('Family already exists.');
            return;
        }

        state.families.unshift({
            ref: ref,
            domain: domain.trim().toLowerCase(),
            name: familyName.trim().toLowerCase(),
            policy: policy,
            artifacts: [],
            updatedAt: Date.now()
        });

        addEvent('family', `Artifact family ${ref} created`, 'info');
        saveState();
        renderTargets();
        renderFamilies();
        renderEvents();
        familyForm.reset();
    });

    artifactForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const targetRef = artifactForm.familyTarget.value;
        const revision = artifactForm.revision.value.trim();
        const moduleCount = Number(artifactForm.moduleCount.value);
        const entrypoint = artifactForm.entrypoint.value.trim();

        const family = state.families.find(function (item) {
            return item.ref === targetRef;
        });

        if (!family) {
            alert('Select a valid family.');
            return;
        }

        const existing = family.artifacts.find(function (artifact) {
            return artifact.revision === revision;
        });

        if (existing) {
            existing.moduleCount = moduleCount;
            existing.entrypoint = entrypoint;
            existing.publishedAt = Date.now();
            addEvent('artifact', `Artifact ${buildArtifactRef(family.ref, revision)} updated`, 'warn');
        } else {
            family.artifacts.unshift({
                revision: revision,
                moduleCount: moduleCount,
                entrypoint: entrypoint,
                publishedAt: Date.now()
            });
            addEvent('artifact', `Artifact ${buildArtifactRef(family.ref, revision)} published`, 'info');
        }

        family.updatedAt = Date.now();
        saveState();
        renderTargets();
        renderFamilies();
        renderEvents();
        artifactForm.reset();
        artifactForm.familyTarget.value = targetRef;
    });

    runtimeForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const selectedArtifactRef = runtimeForm.artifactRef.value;
        const unitName = runtimeForm.unitName.value.trim();
        const mode = runtimeForm.scheduleMode.value;
        const manualNode = runtimeForm.runtimeNode.value;
        const probeIntervalSec = Number(runtimeForm.probeInterval.value);
        const failureThreshold = Number(runtimeForm.failureThreshold.value);
        const restartPolicy = runtimeForm.restartPolicy.value;

        if (!selectedArtifactRef) {
            alert('Select an artifact revision.');
            return;
        }

        const found = findArtifactByRef(selectedArtifactRef);
        if (!found) {
            alert('Artifact reference not found.');
            return;
        }

        if (found.family.policy === 'restricted') {
            const hasSync = state.syncEvents.some(function (eventItem) {
                return eventItem.artifactRef === selectedArtifactRef;
            });
            if (!hasSync) {
                addEvent('policy', `Denied unit ${unitName || 'unnamed'} start: restricted artifact requires sync`, 'error');
                alert('Restricted policy gate: sync this artifact before starting a runtime unit.');
                saveState();
                renderEvents();
                return;
            }
        }

        const requiredModules = found.artifact.moduleCount;
        let targetNode = null;
        if (mode === 'auto') {
            targetNode = pickBestNode(requiredModules);
        } else {
            targetNode = manualNode;
            const nodeConfig = state.nodes.find(function (node) {
                return node.name === targetNode;
            });
            if (!nodeConfig) {
                addEvent('schedule', `Denied unit ${unitName || 'unnamed'}: invalid manual node`, 'error');
                alert('Choose a valid node.');
                saveState();
                renderEvents();
                return;
            }

            const usage = usageForNode(nodeConfig.name);
            const hasCapacity = usage.units < nodeConfig.unitCapacity
                && (usage.modules + requiredModules) <= nodeConfig.moduleBudget;
            if (!hasCapacity) {
                addEvent('schedule', `Denied unit ${unitName || 'unnamed'}: capacity exceeded on ${nodeConfig.name}`, 'error');
                alert('Selected node has insufficient capacity.');
                saveState();
                renderEvents();
                return;
            }
        }

        if (!targetNode) {
            addEvent('schedule', `Denied unit ${unitName || 'unnamed'}: no node fits module requirement ${requiredModules}`, 'error');
            alert('No node has enough free capacity for this runtime unit.');
            saveState();
            renderEvents();
            return;
        }

        state.runtimeUnits.push({
            name: unitName,
            artifactRef: selectedArtifactRef,
            node: targetNode,
            moduleCount: requiredModules,
            status: 'Running',
            schedulingMode: mode,
            probeIntervalSec: probeIntervalSec,
            failureThreshold: failureThreshold,
            restartPolicy: restartPolicy,
            consecutiveProbeFailures: 0,
            restartCount: 0,
            startedAt: Date.now()
        });

        addEvent('schedule', `Runtime unit ${unitName} placed on ${targetNode} using ${mode} scheduling`, 'info');
        saveState();
        renderFamilies();
        renderRuntimeUnits();
        renderNodes();
        renderEvents();
        runtimeForm.reset();
        runtimeForm.scheduleMode.value = mode;
        runtimeForm.restartPolicy.value = restartPolicy;
    });

    nodeForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const nodeName = nodeForm.nodeName.value.trim().toLowerCase();
        const moduleBudget = Number(nodeForm.moduleBudget.value);
        const unitCapacity = Number(nodeForm.unitCapacity.value);

        const exists = state.nodes.some(function (node) {
            return node.name === nodeName;
        });
        if (exists) {
            alert('Node already exists.');
            return;
        }

        state.nodes.push({
            name: nodeName,
            moduleBudget: moduleBudget,
            unitCapacity: unitCapacity
        });

        addEvent('node', `Mesh node ${nodeName} registered (modules ${moduleBudget}, units ${unitCapacity})`, 'info');
        saveState();
        renderTargets();
        renderFamilies();
        renderNodes();
        renderEvents();
        nodeForm.reset();
    });

    serviceForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const serviceName = serviceForm.serviceName.value.trim().toLowerCase();
        const selector = serviceForm.selector.value.trim().toLowerCase();
        const strategy = serviceForm.strategy.value;

        const exists = state.services.some(function (service) {
            return service.name === serviceName;
        });
        if (exists) {
            alert('Service already exists.');
            return;
        }

        state.services.push({
            name: serviceName,
            selector: selector,
            strategy: strategy,
            requestCount: 0,
            cursor: 0
        });

        addEvent('service', `Service ${serviceName} created with selector ${selector}`, 'info');
        saveState();
        renderFamilies();
        renderServices();
        renderEvents();
        serviceForm.reset();
    });

    scheduleMode.addEventListener('change', function () {
        runtimeNode.disabled = scheduleMode.value === 'auto' || state.nodes.length === 0;
    });

    searchInput.addEventListener('input', renderFamilies);

    renderTargets();
    renderFamilies();
    renderRuntimeUnits();
    renderServices();
    renderNodes();
    renderEvents();
    runtimeNode.disabled = scheduleMode.value === 'auto' || state.nodes.length === 0;
});