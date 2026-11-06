import { canonicalPatternLabBakeJson, hashPatternLabBakePhysicalOrder, bakePatternLabRecipe } from './lwseqBake.js';
import { canonicalSceneExpressionBakeJson, hashSceneExpressionFlowLayout, bakeSceneExpressionFlow } from './sceneExpressionRecording.js';
import { classifyPatternLabCompatibility } from './patternLabCompatibility.js';
import { normalizePatternLabRecipe } from './patternLabRecipe.js';
import { recipeFromLook } from './patternLabFromLook.js';
import { normalizeSceneExpression } from './sceneExpression.js';
import { recordingSourceSideMode } from './recordingSideMode.js';
import { createPatternLabHandoff, applyPatternLabHandoff } from './patternLabHandoff.js';
import { createRecordedSequenceAsset, applyRecordedSequenceAsset } from './recordedSequenceAsset.js';

// Reopening adds replacement lineage, which is not an authored render input.
function recipeSource(value) {
  const { sourceSequenceAssetId, sourceSequenceAssetSha256, ...source } = normalizePatternLabRecipe(value);
  return source;
}
export function recordingBakeInput(asset, project) {
  const manifest = asset?.manifest;
  if (!manifest || !/^[a-f0-9]{64}$/.test(manifest.layoutPhysicalOrderSha256 || '')) throw new Error('Recording provenance is incomplete.');
  const mode = recordingSourceSideMode(asset, project);
  if (mode === undefined) throw new Error('The owning source choice is ambiguous.');
  const input = { ...project, symmetry: project.layoutSymmetry ?? project.symmetry,
    sidesMirrored: mode !== 'own', fps: manifest.fps };
  if (manifest.format === 'lightweaver-flow-lwseq-sidecar') {
    const scene = project.expressionScenes?.scenes?.find(scene => scene.id === manifest.scene?.id);
    return { input: { ...input, scene: normalizeSceneExpression(scene || manifest.scene) }, editable: Boolean(scene), kind: 'flow' };
  }
  if (manifest.format !== 'lightweaver-lwseq-sidecar') throw new Error('Recording source is unsupported.');
  const linked = (project.patternLabDrafts || []).filter(draft => draft.sourceSequenceAssetId === asset.id && draft.sourceSequenceAssetSha256 === manifest.lwseqSha256);
  if (linked.length > 1) throw new Error('Several editable recipes refer to this recording. Open the intended source in Lab.');
  const ownerId = manifest.recipe?.sourceLook?.id;
  const owner = ownerId && (project.standaloneController?.looks || project.looks || []).find(look => look.id === ownerId);
  const source = linked[0] || (owner ? recipeFromLook(owner, project) : null);
  const recipe = recipeSource(source || manifest.recipe);
  return { kind: 'lab', editable: Boolean(source), input: { ...input, recipe,
    groups: project.layoutLayerGroups ?? project.groups, audioLanes: recipe.offlineAudio,
    render: project.render || { bpm: project.bpm, gammaEnabled: project.gammaEnabled,
      gammaValue: project.gammaValue, symSettings: project.symSettings } } };
}
export async function recordedSequenceFreshness(asset, project) {
  let provenChange = false;
  try {
    const { input, editable, kind } = recordingBakeInput(asset, project);
    const manifest = asset.manifest;
    const changedSource = kind === 'flow'
      ? canonicalSceneExpressionBakeJson(input.scene) !== canonicalSceneExpressionBakeJson(normalizeSceneExpression(manifest.scene))
      : canonicalPatternLabBakeJson(input.recipe) !== canonicalPatternLabBakeJson(recipeSource(manifest.recipe));
    provenChange = changedSource || (Object.hasOwn(asset, 'bakedSideMode')
      && asset.bakedSideMode !== recordingSourceSideMode(asset, project));
    const hash = kind === 'flow' ? await hashSceneExpressionFlowLayout(input) : await hashPatternLabBakePhysicalOrder(input);
    if (changedSource || hash !== manifest.layoutPhysicalOrderSha256) return { state: 'stale', canRebake: true,
      message: 'Source or artwork changed. Record again to update. Frozen playback is preserved.' };
    if (!editable) return { state: 'unknown', canRebake: true,
      message: 'Editable source unavailable. Freshness unknown; the retained source can be recorded again.' };
    return { state: 'current', canRebake: true, message: 'Recording matches the saved source and artwork.' };
  } catch (error) { return { state: provenChange ? 'stale' : 'unknown', canRebake: false,
    message: `${provenChange ? 'Source changed. Recording needs ready artwork and wiring.' : 'Freshness unknown.'} ${error?.message || 'Source inputs are unavailable.'}` }; }
}

// Called only by the explicit Record again action. Nothing writes or removes
// an old asset until rendering, verification and media persistence all succeed.
export async function rebakeRecordedSequence(asset, project, { signal } = {}) {
  const { input, kind } = recordingBakeInput(asset, project);
  const controller = project.standaloneController || {};
  if (kind === 'flow') {
    const bakeResult = await bakeSceneExpressionFlow({ ...input, signal });
    const result = await createRecordedSequenceAsset({ kind: 'expression-scene', bakeResult,
      controller, sourceSnapshot: input, label: asset.label });
    // Identity is explicit even if an old project has two records of one scene.
    result.asset.id = asset.id;
    result.asset.look.id = asset.id;
    result.replaceSequenceAssetId = asset.id;
    return applyRecordedSequenceAsset(controller, result);
  }
  const recipe = { ...input.recipe, sourceSequenceAssetId: asset.id,
    sourceSequenceAssetSha256: asset.manifest.lwseqSha256 };
  const bakeInput = { ...input, recipe, signal };
  const bakeResult = await bakePatternLabRecipe(bakeInput);
  const result = await createPatternLabHandoff({ ...bakeInput, controller, bakeResult,
    compatibility: { ...classifyPatternLabCompatibility(recipe), classification: 'bake-to-card' } });
  if (result.kind !== 'sequence') throw new Error(result.message || result.reason || 'Recording verification failed.');
  return applyPatternLabHandoff(controller, result);
}
