import { createProjectEnvelope } from './projectRepository.js';

export async function saveAutosaveProjectSnapshot({ repository, project, head = null, localRevision = 1 }) {
  // A head belongs to one project. Card adoption and New project can replace
  // the open ID while an older project's queued save is still finishing.
  let expectedHead = head?.projectId === project.id ? head.contentHash : null;
  if (!expectedHead && repository.read) expectedHead = (await repository.read(project.id))?.contentHash || null;
  const envelope = createProjectEnvelope(project, {
    parentHash: expectedHead,
    localRevision,
    source: repository.source || { kind: 'browser' },
  });
  const persisted = await repository.save(envelope, expectedHead);
  return { projectId: project.id, contentHash: persisted.contentHash };
}
