import markup from '../../../led-art-mapper/app/index.html?raw';
import '../../../led-art-mapper/app/styles.css';
import './embeddedMapper.css';
// Reuse the maintained Mapper DOM and runtime; its project remains a distinct
// portable format. Never inject artwork or authored code into the Studio DOM.
const documentSource = new DOMParser().parseFromString(markup, 'text/html');
documentSource.querySelectorAll('script').forEach(script => script.remove());
document.body.innerHTML = documentSource.body.innerHTML;
document.body.dataset.mode = 'layout';
document.body.dataset.studioMapper = 'true';
document.querySelector('.header-brand').textContent = 'Mapper';
document.querySelector('.btn-v2-link')?.remove();
document.querySelectorAll('.wled-push-row input, .wled-push-row button').forEach(control => { control.disabled = true; });

// Leave required non-visible DOM nodes for the shared runtime, but never mount
// the optional flasher or expose network streaming from the Studio workspace.
async function startMapper() {
const { studioMapperSnapshot } = await import('../../../led-art-mapper/app/src/main.js');
const button = document.createElement('button');
button.textContent = 'Add paths to Studio';
button.addEventListener('click', () => parent.postMessage({ type: 'lw-mapper-review', project: studioMapperSnapshot() }, location.origin));
document.querySelector('.header-actions').prepend(button);

}
void startMapper();
