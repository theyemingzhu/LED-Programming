import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultProject } from './projectModel.js';
import { createMemoryProjectRepository, createProjectEnvelope, ProjectHeadConflictError } from './projectRepository.js';
import { saveAutosaveProjectSnapshot } from './projectAutosaveRepository.js';

function project(id, name) {
  return { ...createDefaultProject(), id, name };
}

test('autosave scopes a repository head to its project after adopting a card project', async () => {
  const repository = createMemoryProjectRepository();
  const oldProject = project('lwproj-previous', 'Previous Studio project');
  const oldHead = await repository.save(createProjectEnvelope(oldProject), null);
  const adopted = project('lightweaver-bench-discovery-v1', 'GPIO 18 — 41 lights');

  const saved = await saveAutosaveProjectSnapshot({
    repository, project: adopted,
    head: { projectId: oldHead.projectId, contentHash: oldHead.contentHash },
    localRevision: 2,
  });

  assert.equal(saved.projectId, adopted.id);
  assert.equal((await repository.read(adopted.id)).project.name, adopted.name);
  assert.equal((await repository.read(oldProject.id)).contentHash, oldHead.contentHash);
});

test('autosave never rebases over a concurrent write to the same project', async () => {
  const repository = createMemoryProjectRepository();
  const original = project('lightweaver-bench-discovery-v1', 'Card project');
  const first = await repository.save(createProjectEnvelope(original), null);
  const external = await repository.save(createProjectEnvelope({ ...original, name: 'Another tab' }, {
    parentHash: first.contentHash, localRevision: 2,
  }), first.contentHash);

  await assert.rejects(saveAutosaveProjectSnapshot({
    repository, project: { ...original, name: 'Local edit' },
    head: { projectId: first.projectId, contentHash: first.contentHash },
    localRevision: 2,
  }), error => error instanceof ProjectHeadConflictError);
  assert.equal((await repository.read(original.id)).contentHash, external.contentHash);
});
