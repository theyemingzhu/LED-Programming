import { normalizeSceneExpression } from './sceneExpression.js';

export const EXPRESSION_SCENES_VERSION = 1;
const DERIVED_SCENE_FIELDS = new Set([
  'resolved',
  'reasons',
  'savedLooks',
  'playlist',
  'controller',
  'runtimePackage',
  'storage',
]);

export class SceneExpressionProjectError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SceneExpressionProjectError';
    this.code = code;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value, path = '$', ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SceneExpressionProjectError('invalid-expression-scenes', `Expression scenes require a finite number at ${path}.`);
    return value;
  }
  if (!value || typeof value !== 'object') {
    throw new SceneExpressionProjectError('invalid-expression-scenes', `Expression scenes must be JSON-safe at ${path}.`);
  }
  if (ancestors.has(value)) throw new SceneExpressionProjectError('invalid-expression-scenes', `Expression scenes cannot contain a cycle at ${path}.`);
  if (Object.getOwnPropertySymbols(value).length) {
    throw new SceneExpressionProjectError('invalid-expression-scenes', `Expression scenes cannot contain symbol keys at ${path}.`);
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new SceneExpressionProjectError('invalid-expression-scenes', `Expression scenes require plain objects at ${path}.`);
  }
  ancestors.add(value);
  const cloned = Array.isArray(value)
    ? value.map((item, index) => cloneJson(item, `${path}[${index}]`, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item, `${path}.${key}`, ancestors)]));
  ancestors.delete(value);
  return cloned;
}

export function createEmptyExpressionScenes() {
  return { version: EXPRESSION_SCENES_VERSION, activeSceneId: null, scenes: [] };
}

function classifyExpressionScenes(value) {
  if (value === undefined || value === null) {
    return { editable: true, collection: createEmptyExpressionScenes() };
  }

  let source;
  try {
    source = cloneJson(value);
  } catch (error) {
    if (error instanceof SceneExpressionProjectError) throw error;
    throw new SceneExpressionProjectError('invalid-expression-scenes', 'Expression scenes are not valid JSON data.');
  }
  if (!isRecord(source)) {
    return {
      editable: false,
      code: 'invalid-expression-scenes',
      message: 'Expression scenes must be an object.',
      collection: source,
    };
  }
  if (Number(source.version) !== EXPRESSION_SCENES_VERSION) {
    return {
      editable: false,
      code: 'unsupported-expression-scenes-version',
      message: `Expression scenes version ${String(source.version)} is not supported by this Studio.`,
      collection: source,
    };
  }
  if (!Array.isArray(source.scenes)) {
    return {
      editable: false,
      code: 'invalid-expression-scenes',
      message: 'Expression scenes must contain a scenes array.',
      collection: source,
    };
  }

  const derivedFields = source.scenes.flatMap((scene, index) => (
    isRecord(scene)
      ? Object.keys(scene).filter(key => DERIVED_SCENE_FIELDS.has(key)).map(field => ({ index, field }))
      : []
  ));
  if (derivedFields.length) {
    return {
      editable: false,
      code: 'derived-expression-data',
      message: 'Compiled expression output cannot be stored as editable scene source.',
      collection: source,
    };
  }

  try {
    const scenes = source.scenes.map(normalizeSceneExpression);
    const ids = new Set();
    for (const scene of scenes) {
      if (ids.has(scene.id)) throw new Error(`Duplicate expression scene ID: ${scene.id}`);
      ids.add(scene.id);
    }
    const activeSceneId = source.activeSceneId === undefined || source.activeSceneId === null
      ? null
      : String(source.activeSceneId);
    if (activeSceneId !== null && !ids.has(activeSceneId)) {
      throw new Error(`Active expression scene is missing: ${activeSceneId}`);
    }
    return {
      editable: true,
      collection: {
        ...source,
        version: EXPRESSION_SCENES_VERSION,
        activeSceneId,
        scenes,
      },
    };
  } catch (error) {
    return {
      editable: false,
      code: 'invalid-expression-scenes',
      message: error instanceof Error ? error.message : 'Expression scenes are invalid.',
      collection: source,
    };
  }
}

export function inspectExpressionScenes(value) {
  const result = classifyExpressionScenes(value);
  return result.editable
    ? { editable: true }
    : { editable: false, code: result.code, message: result.message };
}

export function normalizeExpressionScenesForProject(value) {
  return classifyExpressionScenes(value).collection;
}

export function applyExpressionScenesUpdate(current, update) {
  const currentResult = classifyExpressionScenes(current);
  if (!currentResult.editable) {
    throw new SceneExpressionProjectError(currentResult.code, currentResult.message);
  }
  const input = cloneJson(currentResult.collection);
  const candidate = typeof update === 'function' ? update(input) : update;
  const nextResult = classifyExpressionScenes(candidate);
  if (!nextResult.editable) {
    throw new SceneExpressionProjectError(nextResult.code, nextResult.message);
  }
  return nextResult.collection;
}
