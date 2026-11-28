import { sourceShapeTag } from './svgFlatten.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINT_PROPERTIES = ['stroke', 'fill', 'color'];
const MIRROR_TAGS = new Set([
  'svg', 'g', 'a', 'switch', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
]);

function isSafePaint(value, css) {
  return value === 'none' || (!/\bvar\(/i.test(value) && css.supports('color', value));
}

function paintDeclarations(style, css) {
  return PAINT_PROPERTIES.flatMap(property => {
    const value = style.getPropertyValue(property);
    if (!value || !isSafePaint(value, css)) return [];
    return [[property, value, style.getPropertyPriority(property)]];
  });
}

function solidColor(value) {
  return value && value !== 'none' && value !== 'transparent'
    && !/^rgba\([^)]*,\s*0\s*\)$/.test(value) ? value : undefined;
}

// Read the native CSS cascade on a paint-only mirror. The imported XML never
// enters the page: the mirror carries no geometry, URLs, script, or resource
// nodes. Its isolated styles can only set solid paint.
export function measureSvgColors(root, shapes, documentImpl = globalThis.document) {
  const view = documentImpl?.defaultView;
  const colors = new Map();
  if (!documentImpl?.body || !view?.CSSStyleSheet) return colors;

  const host = documentImpl.createElement('div');
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'closed' });
  const container = documentImpl.createElement('div');
  // An SVG without authored fill defaults to black when rendered. For wiring,
  // only an explicitly painted shape should join a color group.
  container.style.fill = 'none';
  container.style.stroke = 'none';
  container.style.color = 'black';
  shadow.append(container);

  const sheet = new view.CSSStyleSheet();
  const rules = [];
  for (const style of root.querySelectorAll('style')) {
    sheet.replaceSync(style.textContent);
    for (const rule of sheet.cssRules) {
      if (!rule.selectorText || !rule.style) continue;
      const declarations = paintDeclarations(rule.style, view.CSS);
      if (declarations.length) {
        const body = declarations.map(([name, value, priority]) =>
          `${name}:${value}${priority ? ' !important' : ''};`).join('');
        rules.push(`${rule.selectorText} {${body}}`);
      }
    }
  }
  sheet.replaceSync(rules.join('\n'));
  shadow.adoptedStyleSheets = [sheet];

  const mirrors = new Map();
  const styleParser = documentImpl.createElement('div');
  function mirror(node) {
    if (mirrors.has(node)) return mirrors.get(node);
    const tag = sourceShapeTag(node);
    const el = documentImpl.createElementNS(SVG_NS, MIRROR_TAGS.has(tag) ? tag : 'g');
    for (const { name, value } of node.attributes) {
      if (name === 'id' || name === 'class' || name.startsWith('data-')
        || (PAINT_PROPERTIES.includes(name) && isSafePaint(value, view.CSS))) {
        el.setAttribute(name, value);
      }
    }
    const inlineStyle = node.getAttribute('style');
    if (inlineStyle) {
      styleParser.style.cssText = inlineStyle;
      for (const [name, value, priority] of paintDeclarations(styleParser.style, view.CSS)) {
        el.style.setProperty(name, value, priority);
      }
    }
    (node === root ? container : mirror(node.parentElement)).append(el);
    mirrors.set(node, el);
    return el;
  }

  for (const shape of shapes) mirror(shape);
  documentImpl.body.append(host);
  try {
    for (const shape of shapes) {
      const { stroke, fill } = view.getComputedStyle(mirrors.get(shape));
      const color = solidColor(stroke) || solidColor(fill);
      if (color) colors.set(shape, color);
    }
  } finally {
    host.remove();
  }
  return colors;
}
