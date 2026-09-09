/* 本纯编辑器 · Operate extension. Existing ivory / forest / gold identity.
 * Page navigation → select an object → edit its existing content → save/export.
 * Native controls, readable status, no external dependencies or copy rewriting. */
(function () {
  'use strict';
  const embedded = document.getElementById('benchun-scene');
  const app = document.getElementById('app');
  if (!embedded || !app) return;
  const clone = value => JSON.parse(JSON.stringify(value));
  let scene;
  try {
    scene = JSON.parse(embedded.textContent);
    if (!Array.isArray(scene.slides) || !scene.slides.length) throw Error('没有可编辑的页面');
    if (!window.BenchunRenderer || typeof window.BenchunRenderer.renderSlide !== 'function') throw Error('缺少页面渲染组件');
  } catch (error) {
    app.textContent = '无法打开演示文稿：' + error.message;
    app.setAttribute('role', 'alert');
    return;
  }
  const session = window.__BENCHUN_SESSION__;
  const online = !!(session && session.token && /^https?:$/.test(location.protocol));
  let revision = online ? session.revision : null;
  let activeSlide = 0, selected = null, scale = 1, sequence = 0;
  let dirty = false, saving = null, saveTimer = null, saveError = '', saveWarning = '', conflict = false;
  let exportBusy = false, exportText = '', exportLink = null, exportingRevision = null;
  let undoStack = [], redoStack = [], lastHistory = { key: '', at: 0 };
  let present = false, drag = null;
  let proportionsLocked = true, transformAnchor = [0.5, 0.5];
  let transformOpen = false;
  let inspectorTab = 'style';
  const disclosureState = new Map();
  const openMenus = new Set();
  function closeMenus(restoreFocus = false) {
    for (const menu of openMenus) { menu.panel.hidden = true; menu.trigger.setAttribute('aria-expanded', 'false'); if (restoreFocus) menu.trigger.focus(); }
    openMenus.clear();
  }
  function dropdown(label, entries, className = '') {
    const wrap = el('div', 'be-menu-wrap ' + className);
    const panel = el('div', 'be-dropdown'); panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', label);
    const trigger = button(label, () => {
      const show = panel.hidden; closeMenus(); closeTransformPanel();
      if(show) { panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); openMenus.add({panel, trigger}); panel.querySelector('button:not(:disabled)')?.focus(); }
    }, 'be-menu-trigger');
    trigger.setAttribute('aria-expanded','false'); trigger.dataset.menu = label;
    if(label==='更多') decorateIcon(trigger,'ellipsis',true); else trigger.append(icon('chevron-down'));
    entries.forEach(entry => { panel.append(entry); entry.addEventListener('click', () => closeMenus()); });
    wrap.append(trigger,panel); return wrap;
  }
  function activateInspector(tab, focus = false) {
    inspectorTab = tab; closeTransformPanel(); closeMenus();
    const tabs = [...refs.properties.querySelectorAll('[role="tab"]')];
    refs.properties.querySelector('.be-inspector-tabs')?.style.setProperty('--tab-index', String(['style','arrange','page'].indexOf(tab)));
    tabs.forEach(node => { const active=node.dataset.tab===tab;node.setAttribute('aria-selected',String(active)); node.tabIndex=active?0:-1; if(active&&focus)node.focus(); });
    refs.properties.querySelectorAll('.be-inspector-pane').forEach(pane => { pane.hidden=pane.dataset.pane!==tab; });
    refs.properties.querySelector('.be-object-summary')?.toggleAttribute('hidden',tab==='page');
  }
  function disclosure(title, target, key, defaultOpen = false) {
    const group=el('section','be-disclosure'); const opened=disclosureState.get(key)??defaultOpen;
    const toggle=button(title,()=>{
      const next=toggle.getAttribute('aria-expanded')!=='true';disclosureState.set(key,next);
      toggle.setAttribute('aria-expanded',String(next));region.classList.toggle('is-open',next);region.inert=!next;
    },'be-disclosure-toggle');toggle.setAttribute('aria-expanded',String(opened));toggle.dataset.disclosure=key;
    const region=el('div','be-disclosure-region'+(opened?' is-open':''));region.inert=!opened;
    region.id='be-disclosure-'+key;toggle.setAttribute('aria-controls',region.id);
    const inner=el('div','be-disclosure-inner');region.append(inner);group.append(toggle,region);target.append(group);return inner;
  }
  function revealTextEditor() {
    activateInspector('style'); const toggle=refs.properties.querySelector('[data-disclosure="text"]');
    if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();
    refs.properties.querySelector('[data-field="text"]')?.focus();
  }
  function positionTransformPanel() {
    const panel=refs.transformPanel, trigger=refs.transformTrigger;
    if(!transformOpen||!panel?.isConnected||!trigger?.isConnected)return;
    const width=Math.min(336,window.innerWidth-24);
    const bounds=trigger.getBoundingClientRect(), sidebar=refs.properties.getBoundingClientRect();
    const left=sidebar.left>=width+24?sidebar.left-width-12:Math.max(12,(window.innerWidth-width)/2);
    panel.style.width=width+'px';panel.style.maxHeight=Math.max(120,window.innerHeight-24)+'px';
    panel.style.left=left+'px';
    panel.style.top=Math.max(12,Math.min(bounds.top,window.innerHeight-panel.offsetHeight-12))+'px';
  }
  function closeTransformPanel(restoreFocus=false) {
    transformOpen=false;
    if(refs.transformPanel?.matches(':popover-open'))refs.transformPanel.hidePopover();
    refs.transformTrigger?.setAttribute('aria-expanded','false');
    if(restoreFocus)refs.transformTrigger?.focus({preventScroll:true});
  }
  function openTransformPanel(focus=true) {
    if(!refs.transformPanel?.isConnected)return;
    transformOpen=true;refs.transformPanel.showPopover();
    refs.transformTrigger.setAttribute('aria-expanded','true');positionTransformPanel();
    if(focus)refs.transformPanel.querySelector('[data-action="close-transform"]')?.focus({preventScroll:true});
  }
  const scaleBases = new WeakMap();
  const transformable = item => item && ['text', 'shape', 'rect', 'image'].includes(item.type);
  function scaleBase(item) {
    if (!scaleBases.has(item)) scaleBases.set(item, { w: item.w, h: item.h });
    return scaleBases.get(item);
  }
  let fieldSerial = 0;
  const HISTORY_LIMIT = 20;
  const HISTORY_BYTES = 48 * 1024 * 1024;
  const TYPES = { text: '文字', image: '图片', rect: '形状', shape: '形状', table: '表格', chart: '图表' };
  const SHAPES = [['rect', '矩形'], ['roundRect', '圆角矩形'], ['ellipse', '椭圆'], ['triangle', '三角形'], ['rightArrow', '右箭头'], ['line', '直线']];
  const FONTS = [['Microsoft YaHei', '微软雅黑'], ['SimSun', '宋体'], ['SimHei', '黑体'], ['DengXian', '等线'], ['Arial', 'Arial'], ['Georgia', 'Georgia']];
  const ELEMENT_LIMIT = 250;
  const refs = {};
  const dimensions = () => ({ width: Number(scene.canvas?.width) || 1280, height: Number(scene.canvas?.height) || 720 });
  const current = () => scene.slides[activeSlide];
  const object = () => selected === null ? null : current().elements[selected];
  const displayRevision = value => String(value ?? '').slice(0, 8);
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function button(text, action, className) {
    const node = el('button', 'be-button' + (className ? ' ' + className : ''), text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function icon(name) {
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
    svg.classList.add('be-icon'); svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');
    svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
    for(const [tag,attrs] of window.BenchunIcons?.[name]||[]){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);svg.append(node);}return svg;
  }
  function decorateIcon(node,name,only=false) {
    const label=node.textContent;node.setAttribute('aria-label',label);
    if(only){node.replaceChildren(icon(name));node.classList.add('be-icon-button');node.title=node.title||label;}else node.prepend(icon(name));return node;
  }
  function announce(message) {
    refs.announcement.textContent = message;
  }
  function slideTitle(slide, index) {
    return String(slide.elements.find(e => e.type === 'text' && e.role === 'title')?.text || '第 ' + (index + 1) + ' 页');
  }
  function objectTitle(item, index) {
    const detail = item.type === 'text' ? item.text : item.type === 'image' ? item.alt || item.source : item.type === 'chart' ? item.chart?.seriesName : '';
    const type = item.type === 'shape' ? SHAPES.find(entry => entry[0] === item.geometry)?.[1] || '形状' : TYPES[item.type] || item.type;
    return (index + 1) + '. ' + type + (detail ? ' · ' + String(detail).replace(/\s+/g, ' ') : '');
  }
  function buildShell() {
    app.replaceChildren();
    app.className = 'be-editor';
    const header = el('header', 'be-topbar');
    const identity = el('div', 'be-identity');
    identity.append(el('span', 'be-brand', '本纯魔法'), el('h1', 'be-title', scene.title || '演示文稿'));
    const state = el('div', 'be-save-state');
    refs.status = el('span', 'be-status');
    refs.status.setAttribute('role', 'status');
    refs.status.setAttribute('aria-live', 'polite');
    state.append(refs.status);
    const actions = el('div', 'be-top-actions');
    actions.setAttribute('aria-label', '文稿操作');
    refs.undo = button('撤销', undo);
    refs.undo.title = '撤销（Ctrl / ⌘ + Z）';
    refs.redo = button('重做', redo);
    refs.redo.title = '重做（Ctrl / ⌘ + Shift + Z）';
    decorateIcon(refs.undo,'undo-2',true);decorateIcon(refs.redo,'redo-2',true);
    refs.save = button(online ? '保存' : '保存 HTML', () => online ? saveNow(true) : downloadHTML());
    refs.save.title = '保存（Ctrl / ⌘ + S）';
    actions.append(refs.undo, refs.redo, refs.save);
    const download = button('下载 HTML', downloadHTML);
    refs.pptx = button('导出 PPTX', () => exportDocument('pptx'));
    refs.pdf = button(online ? '导出 PDF' : '打印 / PDF', () => online ? exportDocument('pdf') : printAllSlides());
    if (!online) {
      refs.pptx.disabled = true;
      refs.pptx.title = '请通过本地编辑服务打开，才能导出 PPTX';
      refs.pdf.title = '打印全部页面，可在打印窗口选择另存为 PDF';
    }
    actions.append(dropdown('导出', [download,refs.pptx,refs.pdf], 'be-export-wrap'), decorateIcon(button('演示', () => setPresent(true), 'be-primary'),'play'));
    header.append(identity, state, actions);
    refs.messages = el('div', 'be-messages');
    refs.messages.setAttribute('aria-live', 'polite');
    const workspace = el('div', 'be-workspace');
    const pages = el('nav', 'be-pages');
    pages.setAttribute('aria-label', '页面导航');
    const pagesHeading = el('div', 'be-panel-heading');
    pagesHeading.append(el('h2', '', '页面'), el('span', 'be-count', scene.slides.length + ' 页'));
    refs.pageList = el('ol', 'be-page-list');
    pages.append(pagesHeading, refs.pageList);
    const center = el('section', 'be-center');
    center.setAttribute('aria-label', '画布编辑区');
    const canvasBar = el('div', 'be-canvas-bar');
    refs.pageLabel = el('span', 'be-page-label');
    refs.zoom = el('span', 'be-zoom');
    canvasBar.append(refs.pageLabel, refs.zoom);
    const insertBar = el('div', 'be-insert-bar');
    insertBar.setAttribute('aria-label', '添加对象');
    const addText = button('添加文字', () => addObject('text'));
    addText.dataset.action = 'add-text';
    decorateIcon(addText,'type');
    const shapeGroup = dropdown('添加形状',SHAPES.map(([geometry,label])=>button(label,()=>addObject(geometry))),'be-shape-insert');
    const addShape = shapeGroup.querySelector('.be-menu-trigger');decorateIcon(addShape,'square');
    addShape.dataset.action = 'add-shape';
    const insertImageInput = el('input', 'be-sr-only');
    insertImageInput.type = 'file'; insertImageInput.accept = 'image/png,image/jpeg,image/webp'; insertImageInput.dataset.field = 'insert-image';
    insertImageInput.addEventListener('change', () => insertImage(insertImageInput.files?.[0], insertImageInput));
    const addImage = button('插入图片', () => { insertImageInput.value = ''; insertImageInput.click(); });
    addImage.dataset.action = 'add-image';
    decorateIcon(addImage,'image');
    insertBar.append(addText, shapeGroup, addImage, insertImageInput);
    refs.insertButtons = [addText, addShape, addImage];
    refs.viewport = el('div', 'be-viewport');
    refs.frame = el('div', 'be-canvas-frame');
    refs.stage = el('div', 'be-stage');
    refs.stage.tabIndex = 0;
    refs.stage.setAttribute('role', 'group');
    refs.stage.setAttribute('aria-label', '当前页面画布；选中对象后可用方向键移动，Shift 加速');
    refs.frame.append(refs.stage);
    refs.viewport.append(refs.frame);
    const canvasFoot = el('div', 'be-canvas-foot');
    canvasFoot.append(el('span', '', '点选对象 · 拖动位置 · 右侧修改属性'));
    const paging = el('div', 'be-paging');
    refs.prev = button('上一页', () => go(-1));
    refs.next = button('下一页', () => go(1));
    paging.append(refs.prev, refs.next);
    canvasFoot.append(paging);
    center.append(canvasBar, insertBar, refs.viewport, canvasFoot);
    refs.properties = el('aside', 'be-properties');
    refs.properties.setAttribute('aria-label', '对象属性');
    workspace.append(pages, center, refs.properties);
    const footer = el('footer', 'be-footer', online ? '本地编辑 · 自动保存至项目文件 · 生成导出文件不会替换原稿' : '离线编辑 · 请保存 HTML 备份 · 打印可另存为 PDF，PPTX 需本地编辑服务');
    refs.announcement = el('div', 'be-sr-only');
    refs.announcement.setAttribute('aria-live', 'polite');
    refs.presentation = el('nav', 'be-presentation-controls');
    refs.presentation.setAttribute('aria-label', '演示控制');
    refs.presentPage = el('span', 'be-present-page');
    refs.presentation.append(button('上一页', () => go(-1)), refs.presentPage, button('下一页', () => go(1)), button('退出演示', () => setPresent(false)));
    app.append(header, refs.messages, workspace, footer, refs.presentation, refs.announcement);
    refs.stage.addEventListener('pointerdown', pointerDown);
    refs.stage.addEventListener('dblclick', event => {
      if (event.target.closest('.element') && object()?.type === 'text') {
        revealTextEditor();
      }
    });
    refs.viewport.addEventListener('pointerdown', event => {
      if (event.target === refs.viewport || event.target === refs.frame) select(null);
    });
  }
  function renderNavigation() {
    refs.pageList.replaceChildren();
    scene.slides.forEach((slide, i) => {
      const li = el('li');
      const item = button('', () => setSlide(i), 'be-page-button');
      item.append(el('span', 'be-page-number', String(i + 1).padStart(2, '0')), el('span', 'be-page-name', slideTitle(slide, i)));
      item.title = slideTitle(slide, i);
      item.dataset.pageIndex = String(i);
      if (i === activeSlide) item.setAttribute('aria-current', 'page');
      li.append(item);
      refs.pageList.append(li);
    });
    refs.prev.disabled = activeSlide === 0;
    refs.next.disabled = activeSlide === scene.slides.length - 1;
    refs.pageLabel.textContent = '第 ' + (activeSlide + 1) + ' / ' + scene.slides.length + ' 页';
    refs.presentPage.textContent = (activeSlide + 1) + ' / ' + scene.slides.length;
  }
  function renderCanvas() {
    refs.stage.innerHTML = window.BenchunRenderer.renderSlide(current(), activeSlide, scene);
    const slide = refs.stage.querySelector('.slide');
    if (slide) { slide.style.margin = '0'; slide.style.boxShadow = 'none'; }
    refs.selection = el('div', 'be-selection');
    refs.selection.setAttribute('aria-label', '自由变换控制框');
    refs.stage.append(refs.selection);
    updateSelection();
    fitCanvas();
  }
  function fitCanvas() {
    const size = dimensions();
    const bounds = refs.viewport.getBoundingClientRect();
    const narrow = !present && matchMedia('(max-width: 800px)').matches;
    const horizontalPadding = narrow ? 24 : 48;
    const verticalPadding = narrow ? 24 : 48;
    scale = Math.max(0.02, Math.min((bounds.width - horizontalPadding) / size.width, (bounds.height - verticalPadding) / size.height, present ? 2 : 1));
    refs.stage.style.width = size.width + 'px';
    refs.stage.style.height = size.height + 'px';
    refs.stage.style.transform = 'scale(' + scale + ')';
    refs.frame.style.width = size.width * scale + 'px';
    refs.frame.style.height = size.height * scale + 'px';
    refs.stage.style.setProperty('--be-selection-width', (2 / scale) + 'px');
    refs.stage.style.setProperty('--be-handle-size', (11 / scale) + 'px');
    refs.zoom.textContent = Math.round(scale * 100) + '% · ' + size.width + ' × ' + size.height;
  }
  function updateSelection() {
    const item = object();
    if (!refs.selection) return;
    refs.selection.hidden = !item || present;
    if (item) Object.assign(refs.selection.style, {
      left: item.x + 'px', top: item.y + 'px', width: item.w + 'px', height: item.h + 'px',
      transformOrigin: 'center center',
      transform: 'rotate(' + (Number(item.rotation) || 0) + 'deg)'
    });
    if (!drag) {
      refs.selection.replaceChildren();
      if (transformable(item) && !present) {
        [['nw',0,0],['n',.5,0],['ne',1,0],['e',1,.5],['se',1,1],['s',.5,1],['sw',0,1],['w',0,.5]].forEach(([name,x,y]) => {
          const handle = el('span','be-resize-handle'); handle.dataset.resize = name;
          handle.style.left = x*100+'%'; handle.style.top = y*100+'%';
          handle.style.cursor = name+'-resize'; handle.title = '拖动缩放 · Shift 切换比例锁定 · Alt 从中心缩放';
          refs.selection.append(handle);
        });
      }
    }
    refs.stage.querySelectorAll('.element').forEach(node => {
      const chosen = Number(node.dataset.element) === selected;
      node.classList.toggle('be-selected', chosen);
    });
  }
  function select(index) {
    const prior = selected;
    selected = index === null ? null : Number(index);
    if (selected !== null && !current().elements[selected]) selected = null;
    if(prior!==selected)closeTransformPanel();
    if(prior!==selected) { closeMenus(); inspectorTab=selected===null?'page':'style'; }
    if (prior !== selected && transformable(object())) scaleBases.delete(object());
    lastHistory = { key: '', at: 0 };
    updateSelection();
    renderProperties();
  }
  function setSlide(index) {
    closeTransformPanel();
    activeSlide = Math.max(0, Math.min(scene.slides.length - 1, index));
    selected = null;
    inspectorTab='page';closeMenus();
    lastHistory = { key: '', at: 0 };
    renderNavigation(); renderCanvas(); renderProperties(); renderStatus();
  }
  function go(delta) { setSlide(activeSlide + delta); }
  function field(labelText, input, target) {
    const wrap = el('div', 'be-field');
    const id = 'be-field-' + (++fieldSerial);
    input.id = id;
    const label = el('label', 'be-label', labelText);
    label.htmlFor = id;
    wrap.append(label, input);
    if (input.tagName === 'INPUT' && input.type === 'number') {
      const error = el('span', 'be-field-error'); error.id = id + '-error'; error.hidden = true;
      input.setAttribute('aria-describedby', error.id); wrap.append(error);
    }
    target.append(wrap);
    return input;
  }
  function inputField(label, value, key, target, handler, options) {
    const opts = options || {};
    const input = el(opts.multiline ? 'textarea' : 'input', 'be-input');
    if (!opts.multiline) input.type = opts.type || 'text';
    if (opts.multiline) input.rows = opts.rows || 4;
    input.value = value ?? '';
    input.dataset.field = key;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    input.addEventListener(opts.event || 'input', () => handler(input.value, input));
    return field(label, input, target);
  }
  function selectField(label, value, key, choices, target, handler) {
    const input = el('select', 'be-input');
    input.dataset.field = key;
    choices.forEach(([keyValue, text]) => {
      const option = el('option', '', text); option.value = keyValue; input.append(option);
    });
    input.value = value;
    input.addEventListener('change', () => handler(input.value));
    return field(label, input, target);
  }
  function section(title, target) {
    const group = el('section', 'be-property-section');
    group.append(el('h3', '', title)); target.append(group); return group;
  }
  function colorField(label, value, key, target, onChange, allowNone) {
    const wrap = el('div', 'be-field');
    const id = 'be-color-' + (++fieldSerial);
    const labelNode = el('label', 'be-label', label); labelNode.htmlFor = id;
    const row = el('div', 'be-color-row');
    const picker = el('input', 'be-input be-color-picker'); picker.type = 'color'; picker.id = id; picker.dataset.field = key;
    const color = /^#[0-9a-f]{6}$/i.test(value) ? value : '#174B3A';
    picker.value = color;
    const hex = el('input', 'be-input be-color-hex'); hex.type = 'text'; hex.value = color.toUpperCase(); hex.dataset.field = key + '-hex';
    hex.setAttribute('aria-label', label + '十六进制色值'); hex.spellcheck = false; hex.maxLength = 7;
    const error = el('span', 'be-field-error'); error.id = id + '-error'; error.hidden = true;
    hex.setAttribute('aria-describedby', error.id);
    row.append(picker, hex); wrap.append(labelNode, row, error);
    picker.addEventListener('input', () => { hex.value = picker.value.toUpperCase(); hex.setCustomValidity(''); hex.removeAttribute('aria-invalid'); error.hidden = true; onChange(picker.value); });
    hex.addEventListener('input', () => {
      const valid = /^#[0-9a-f]{6}$/i.test(hex.value.trim());
      hex.setCustomValidity(valid ? '' : '请输入 # 加六位十六进制颜色，例如 #174B3A');
      if (!valid) { hex.setAttribute('aria-invalid', 'true'); error.textContent = '请输入 # 加六位色值；此输入尚未应用。'; error.hidden = false; return; }
      hex.removeAttribute('aria-invalid'); error.hidden = true; picker.value = hex.value.trim(); onChange(hex.value.trim());
    });
    if (allowNone) {
      const none = el('input'); none.type = 'checkbox'; none.checked = value === 'none'; none.dataset.field = key + '-none';
      const noneLabel = el('label', 'be-checkbox be-paint-none'); noneLabel.append(none, el('span', '', key === 'stroke' ? '无描边' : '无填充'));
      picker.disabled = hex.disabled = none.checked;
      none.addEventListener('change', () => {
        picker.disabled = hex.disabled = none.checked; hex.setCustomValidity(''); hex.removeAttribute('aria-invalid'); error.hidden = true; hex.value = picker.value.toUpperCase();
        onChange(none.checked ? 'none' : picker.value);
      });
      wrap.append(noneLabel);
    }
    target.append(wrap);
    return picker;
  }
  function backgroundHasImage() {
    const size = dimensions();
    return current().elements.some(item => item.type === 'image' && item.x <= 0.5 && item.y <= 0.5 && item.w >= size.width - 1 && item.h >= size.height - 1);
  }
  function refreshLayers() {
    const input = refs.properties.querySelector('[data-field="layer"]');
    if (!input) return;
    input.replaceChildren();
    [['', '请选择对象'], ...current().elements.map((item, index) => [String(index), objectTitle(item, index)])].forEach(([value, label]) => {
      const option = el('option', '', label); option.value = value; input.append(option);
    });
    input.value = selected === null ? '' : String(selected);
  }
  function structuralMutation(key, action) {
    if (drag || present) return;
    remember(key, true); action(); lastHistory = { key: '', at: 0 }; changed();
    renderNavigation(); renderCanvas(); renderProperties();
  }
  function addObject(kind) {
    if (current().elements.length >= ELEMENT_LIMIT) { announce('每页最多 250 个对象，请先删除不需要的对象。'); return; }
    const size = dimensions(), isText = kind === 'text', line = kind === 'line';
    const w = Math.min(isText ? 520 : line ? 300 : 260, size.width - 32);
    const h = Math.min(isText ? 100 : line ? 4 : 160, size.height - 32);
    const offset = (current().elements.length % 5) * 16;
    const x = Math.min(size.width - w, 96 + offset), y = Math.min(size.height - h, 224 + offset);
    const rgb = (current().background || '#FFFDF8').slice(1).match(/.{2}/g)?.map(value => parseInt(value, 16)) || [255, 253, 248];
    const ink = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 135 ? '#FFFDF8' : '#174B3A';
    const item = isText
      ? { type: 'text', text: '输入文字', x, y, w, h, size: 32, color: ink, bold: false, italic: false, underline: false, font: scene.font || 'Microsoft YaHei', align: 'left', role: 'body' }
      : { type: 'shape', geometry: kind, x, y, w, h, fill: line ? 'none' : '#174B3A', stroke: line ? '#174B3A' : 'none', strokeWidth: line ? 3 : 0, ...(kind === 'roundRect' ? { r: 16 } : {}) };
    structuralMutation('add-object', () => { current().elements.push(item); selected = current().elements.length - 1; });
    announce('已添加' + (isText ? '文字' : SHAPES.find(entry => entry[0] === kind)?.[1] || '形状') + '，位于最上层。');
    if (isText) { revealTextEditor(); refs.properties.querySelector('[data-field="text"]')?.select(); }
    else refs.stage.focus({ preventScroll: true });
  }
  function duplicateObject() {
    if (!object() || current().elements.length >= ELEMENT_LIMIT) return;
    const item = clone(object()), size = dimensions();
    item.x = Math.max(0, Math.min(size.width - item.w, item.x + 24));
    item.y = Math.max(0, Math.min(size.height - item.h, item.y + 24));
    structuralMutation('duplicate-object', () => { current().elements.push(item); selected = current().elements.length - 1; });
    refs.stage.focus({ preventScroll: true }); announce('已复制对象，副本位于最上层。');
  }
  function deleteObject() {
    if (!object()) return;
    structuralMutation('delete-object', () => { current().elements.splice(selected, 1); selected = current().elements.length ? Math.min(selected, current().elements.length - 1) : null; });
    refs.stage.focus({ preventScroll: true }); announce('已删除对象，可撤销恢复。');
  }
  function moveLayer(mode) {
    if (!object()) return;
    const target = mode === 'front' ? current().elements.length - 1 : mode === 'back' ? 0 : selected + (mode === 'up' ? 1 : -1);
    if (target < 0 || target >= current().elements.length || target === selected) return;
    structuralMutation('layer-' + mode, () => { const item = current().elements.splice(selected, 1)[0]; current().elements.splice(target, 0, item); selected = target; });
    refs.stage.focus({ preventScroll: true }); announce('图层顺序已调整。');
  }
  function updateShapeProperty(key, value) {
    const item = object();
    if (!item || item[key] === value) return;
    mutate(key, () => {
      if (item.type === 'rect' && (key === 'r' || key === 'stroke' || key === 'strokeWidth' || key === 'geometry' || value === 'none')) {
        item.type = 'shape'; item.geometry = key === 'r' || item.r > 0 ? 'roundRect' : 'rect'; item.stroke = 'none'; item.strokeWidth = 0;
      }
      item[key] = value;
      if (key === 'stroke' && value !== 'none' && !(item.strokeWidth > 0)) item.strokeWidth = 2;
      if (key === 'geometry' && value === 'roundRect' && !(item.r > 0)) item.r = 16;
      if (key === 'geometry' && value === 'line') { item.fill = 'none'; if (!item.stroke || item.stroke === 'none') item.stroke = '#174B3A'; if (!(item.strokeWidth > 0)) item.strokeWidth = 3; }
    });
    if (key === 'geometry') renderProperties();
    else if (key === 'stroke') { const width = refs.properties.querySelector('[data-field="strokeWidth"]'); if (width) width.value = item.strokeWidth; }
  }
  function normalizedRotation(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return ((number + 180) % 360 + 360) % 360 - 180;
  }
  function renderCornerControls(item,target) {
    const group=el('div','be-corner-control');target.append(group);
    const label=el('span','be-label','圆角半径');group.append(label);
    const row=el('div','be-corner-row');group.append(row);
    const range=el('input','be-transform-range');range.type='range';range.dataset.field='radius-range';range.setAttribute('aria-label','圆角半径滑块');
    const wrap=el('div','be-corner-number');const number=el('input','be-input');number.type='number';number.dataset.field='r';number.setAttribute('aria-label','圆角半径 / px');
    const limit=Math.min(360,item.w/2,item.h/2),initial=Math.min(item.r??16,limit);
    for(const input of [range,number]){input.min='0';input.max=String(limit);input.step='0.5';input.value=String(initial);}
    wrap.append(number,el('span','be-corner-unit','px'));row.append(range,wrap);
    const hint=el('p','be-note','0 为直角，向右拖动更圆润。最大为短边的一半。');group.append(hint);
    const apply=(input)=>{
      const value=Number(input.value),max=Math.min(360,object().w/2,object().h/2);
      if(input.value.trim()===''||!Number.isFinite(value)||value<0||value>max){fieldValidity(input,'请输入 0 至 '+max+' px 之间的圆角半径。');return;}
      fieldValidity(number,'');updateShapeProperty('r',value);range.value=String(value);number.value=String(value);
    };
    range.addEventListener('input',()=>apply(range));number.addEventListener('input',()=>apply(number));
  }
  // Geometry is baked into native dimensions/font size so all export paths agree.
  function resized(base, w, h, anchor) {
    const a = (Number(base.rotation)||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
    const dx=(base.w-w)*(anchor[0]-.5), dy=(base.h-h)*(anchor[1]-.5);
    const result={x:base.x+(base.w-w)/2+c*dx-s*dy, y:base.y+(base.h-h)/2+s*dx+c*dy, w, h};
    if (base.type==='text') result.size=base.size*h/base.h;
    return result;
  }
  function validResize(p) {
    const d=dimensions();
    return p.w>=1 && p.h>=1 && p.x>=-0.00001 && p.y>=-0.00001 && p.x+p.w<=d.width+.00001 && p.y+p.h<=d.height+.00001 && (p.size===undefined || (p.size>=8 && p.size<=160));
  }
  function applyResize(item,p) { Object.assign(item,p); item.x=Math.max(0,item.x); item.y=Math.max(0,item.y); }
  function syncTransformValues() {
    const item=object(); if (!transformable(item)) return;
    const base=scaleBase(item);
    const vals={x:item.x,y:item.y,w:item.w,h:item.h,size:item.size,'scale-w':item.w/base.w*100,'scale-h':item.h/base.h*100};
    Object.entries(vals).forEach(([key,value])=>{const node=refs.properties.querySelector('[data-field="'+key+'"]'); if(node && node!==document.activeElement && value!==undefined)node.value=Math.round(value*100)/100;});
  }
  function setScalePercent(axis,value,input) {
    const item=object(), n=Number(value); if(!item)return;
    if(!Number.isFinite(n)||n<=0||String(value).trim()===''){fieldValidity(input,'请输入大于 0 的缩放比例。');return;}
    const base=scaleBase(item), factor=(base[axis]*n/100)/item[axis];
    const w=axis==='w'||proportionsLocked?item.w*factor:item.w;
    const h=axis==='h'||proportionsLocked?item.h*factor:item.h;
    const p=resized(item,w,h,transformAnchor);
    if(!validResize(p)){fieldValidity(input,'缩放后将超出画布或字号范围，请缩小比例或调整参考位置。');return;}
    fieldValidity(input,''); mutate('scale-'+axis,()=>applyResize(item,p)); syncTransformValues();
  }
  function scaleStep(factor) {
    const item=object(); if(!item)return; scaleBase(item);
    const p=resized(item,item.w*factor,item.h*factor,transformAnchor);
    if(!validResize(p)){announce('已到当前参考位置可用的缩放范围。');return;}
    mutate('scale-step',()=>applyResize(item,p)); renderProperties();
  }
  function renderScaleControls(item,target) {
    const base=scaleBase(item), top=el('div','be-scale-top'), anchors=el('div','be-anchor-grid');
    anchors.setAttribute('role','group'); anchors.setAttribute('aria-label','变换参考位置');
    const labels=['左上','上中','右上','左中','中心','右中','左下','下中','右下'];
    labels.forEach((label,i)=>{const x=(i%3)/2,y=Math.floor(i/3)/2; const b=button('',()=>{transformAnchor=[x,y];renderProperties();},'be-anchor'); b.title=label+'参考位置'; b.setAttribute('aria-label',b.title); b.setAttribute('aria-pressed',String(x===transformAnchor[0]&&y===transformAnchor[1])); anchors.append(b);});
    top.append(anchors,el('span','be-note','参考位置\n缩放时固定此点')); target.append(top);
    const row=el('div','be-field-grid'); target.append(row);
    inputField('W 宽度 / %',Math.round(item.w/base.w*10000)/100,'scale-w',row,(v,n)=>setScalePercent('w',v,n),{type:'number',min:.01,step:1,event:'change'});
    inputField('H 高度 / %',Math.round(item.h/base.h*10000)/100,'scale-h',row,(v,n)=>setScalePercent('h',v,n),{type:'number',min:.01,step:1,event:'change'});
    const lock=el('input'); lock.type='checkbox';lock.checked=proportionsLocked;lock.dataset.field='lock-proportions';
    lock.addEventListener('change',()=>{proportionsLocked=lock.checked;});
    const label=el('label','be-checkbox');label.append(lock,el('span','','锁定宽高比例'));target.append(label);
    const quick=el('div','be-transform-actions');
    const smaller=button('− 缩小',()=>scaleStep(1/1.1));smaller.dataset.action='scale-down';
    const larger=button('+ 放大',()=>scaleStep(1.1));larger.dataset.action='scale-up';
    quick.append(smaller,larger);target.append(quick);
  }
  function setRotation(value, input) {
    const number = Number(value);
    if (String(value).trim() === '' || !Number.isFinite(number) || number < -180 || number > 180) {
      if (input) fieldValidity(input, '请输入 -180 至 180 之间的角度；此输入尚未应用。');
      return;
    }
    if (input) fieldValidity(input, '');
    updateProperty('rotation', number);
    const range = refs.properties.querySelector('[data-field="rotation-range"]');
    const numeric = refs.properties.querySelector('[data-field="rotation"]');
    if (range && range !== input) range.value = String(number);
    if (numeric && numeric !== input) numeric.value = String(number);
  }
  function stepRotation(delta) {
    if (!object()) return;
    const next = normalizedRotation((Number(object().rotation) || 0) + delta);
    mutate('rotation-step', () => { object().rotation = next; });
    renderProperties();
    announce('对象已旋转至 ' + next + '°。');
  }
  function resetTransform() {
    if (!object()) return;
    mutate('transform-reset', () => {
      object().rotation = 0;
      object().flipHorizontal = false;
      object().flipVertical = false;
    });
    renderProperties();
    announce('已重置旋转与翻转。');
  }
  function renderTransformControls(item, target) {
    if (!['text', 'image', 'rect', 'shape'].includes(item.type)) return;
    const trigger=button('自由变换',()=>transformOpen?closeTransformPanel(true):openTransformPanel(),'be-transform-trigger');
    const arrow=icon('chevron-down');arrow.classList.add('be-transform-chevron');trigger.append(arrow);
    trigger.dataset.action='toggle-transform';trigger.setAttribute('aria-haspopup','dialog');
    trigger.setAttribute('aria-expanded',String(transformOpen));trigger.setAttribute('aria-controls','be-transform-popover');
    refs.transformTrigger=trigger;target.append(trigger);
    const panel=el('div','be-transform-popover');panel.id='be-transform-popover';panel.setAttribute('popover','manual');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','自由变换');
    refs.transformPanel=panel;target.append(panel);
    const head=el('div','be-transform-panel-head');head.append(el('h3','','自由变换'));
    const close=button('×',()=>closeTransformPanel(true),'be-transform-close');close.dataset.action='close-transform';close.setAttribute('aria-label','收起自由变换');head.append(close);panel.append(head);
    const transform=el('div','be-transform-panel-body');panel.append(transform);
    renderScaleControls(item, transform);
    const angleRow = el('div', 'be-transform-angle');
    const range = el('input', 'be-transform-range');
    range.type = 'range'; range.min = '-180'; range.max = '180'; range.step = '1'; range.value = String(Number(item.rotation) || 0); range.dataset.field = 'rotation-range';
    range.setAttribute('aria-label', '旋转角度');
    range.addEventListener('input', () => setRotation(range.value, range));
    const number = el('input', 'be-input');
    number.type = 'number'; number.min = '-180'; number.max = '180'; number.step = '1'; number.value = String(Number(item.rotation) || 0); number.dataset.field = 'rotation';
    number.setAttribute('aria-label', '旋转角度数值');
    number.addEventListener('input', () => setRotation(number.value, number));
    const unit = el('span', 'be-transform-unit', '°');
    angleRow.append(range, number, unit); transform.append(el('span', 'be-label', '旋转角度'), angleRow);
    const quick = el('div', 'be-transform-actions');
    const left = button('左转 90°', () => stepRotation(-90)); left.dataset.action = 'rotate-left';
    const right = button('右转 90°', () => stepRotation(90)); right.dataset.action = 'rotate-right';
    quick.append(left, right); transform.append(quick);
    const flips = el('div', 'be-transform-flips');
    [['flipHorizontal', '水平翻转'], ['flipVertical', '垂直翻转']].forEach(([key, title]) => {
      const check = el('input'); check.type = 'checkbox'; check.checked = !!item[key]; check.dataset.field = key;
      check.addEventListener('change', () => updateProperty(key, check.checked));
      const label = el('label', 'be-checkbox'); label.append(check, el('span', '', title)); flips.append(label);
    });
    transform.append(flips);
    const reset = button('重置旋转与翻转', resetTransform, 'be-transform-reset'); reset.dataset.action = 'reset-transform';
    reset.disabled = !(Number(item.rotation) || item.flipHorizontal || item.flipVertical);
    transform.append(reset);
    const tips=el('details','be-transform-tips');tips.append(el('summary','','操作提示'),el('p','be-note','100% 为本次选中时的尺寸。拖动八个控制点缩放；Shift 临时切换比例锁定，Alt 固定中心。文字高度缩放会同步调整字号。旋转与翻转围绕中心进行，缩放按所选参考位置执行。保存、撤销与导出均保留结果。'));tips.addEventListener('toggle',positionTransformPanel);transform.append(tips);
    if(transformOpen)openTransformPanel(false);
  }
  function renderProperties() {
    const panelScroll=refs.transformPanel?.scrollTop||0;
    refs.properties.replaceChildren();
    refs.transformPanel=null;refs.transformTrigger=null;
    closeMenus();
    const tabs=el('div','be-inspector-tabs'); tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','属性分类');
    tabs.append(el('span','be-tab-indicator'));
    [['style','样式'],['arrange','排列'],['page','页面']].forEach(([key,label],index)=>{
      const tab=button(label,()=>activateInspector(key),'be-inspector-tab');tab.dataset.tab=key;tab.id='be-tab-'+key;
      tab.setAttribute('role','tab');tab.setAttribute('aria-controls','be-pane-'+key);
      tab.addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) { event.preventDefault(); event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;activateInspector(['style','arrange','page'][next],true); }});
      tabs.append(tab);
    });refs.properties.append(tabs);
    const body = el('div', 'be-property-body'); refs.properties.append(body);
    const page = el('section', 'be-page-settings be-inspector-pane');page.dataset.pane='page';page.id='be-pane-page';page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby','be-tab-page');
    colorField('页面底色', current().background, 'background', page, value => {
      if (current().background !== value) mutate('background', () => { current().background = value; });
    }, false);
    refs.backgroundNote = el('p', 'be-note be-background-note', '本页有全幅图片，可能遮住页面底色；修改底色不会改变图片。');
    refs.backgroundNote.hidden = !backgroundHasImage(); page.append(refs.backgroundNote); body.append(page);
    const options = [['', '请选择对象'], ...current().elements.map((e, i) => [String(i), objectTitle(e, i)])];
    const summary=el('div','be-object-summary');body.append(summary);
    const picker=selectField('选中对象', selected === null ? '' : String(selected), 'layer', options, summary, value => select(value === '' ? null : Number(value)));picker.classList.add('be-object-picker');
    const stylePane=el('section','be-inspector-pane');stylePane.dataset.pane='style';stylePane.id='be-pane-style';
    const arrangePane=el('section','be-inspector-pane');arrangePane.dataset.pane='arrange';arrangePane.id='be-pane-arrange';
    [stylePane,arrangePane].forEach(pane=>{pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','be-tab-'+pane.dataset.pane);body.append(pane);});
    const item = object();
    if (!item) {
      [stylePane,arrangePane].forEach(pane=>pane.append(el('p', 'be-empty', '点击画布或上方列表选择对象，即可调整属性。')));
      activateInspector(inspectorTab);
      return;
    }
    const duplicate = button('复制', duplicateObject); duplicate.dataset.action = 'duplicate-object'; duplicate.disabled = current().elements.length >= ELEMENT_LIMIT; duplicate.title = '复制对象（画布聚焦时 Ctrl / ⌘ + D）';
    const remove = button('删除', deleteObject, 'be-delete-button'); remove.dataset.action = 'delete-object'; remove.title = '删除对象（画布聚焦时 Delete），可撤销恢复';
    summary.append(dropdown('更多',[duplicate,remove],'be-object-menu'));
    if (item.type === 'text') {
      const content = disclosure('文字内容', stylePane, 'text');
      inputField('文字（支持换行）', item.text, 'text', content, value => updateProperty('text', value), { multiline: true, rows: 4 });
      const typography = disclosure('文字样式', stylePane,'typography',true);
      const defaultFont=FONTS.find(entry=>entry[0]===(scene.font||'Microsoft YaHei'))?.[1]||scene.font||'微软雅黑';
      const fontOptions = [['', defaultFont+'（文稿默认）'], ...FONTS];
      if (item.font && !FONTS.some(entry => entry[0] === item.font)) fontOptions.push([item.font, item.font + '（现有字体）']);
      selectField('字体', item.font || '', 'font', fontOptions, typography, value => mutate('font', () => { if (value) object().font = value; else delete object().font; }));
      const row = el('div', 'be-type-row'); typography.append(row);
      inputField('字号 / px', item.size, 'size', row, (value, input) => numericProperty('size', value, input, 8, 160), { type: 'number', min: 8, max: 160, step: 1 });
      row.querySelector('.be-field').classList.add('be-size-field');row.querySelector('.be-field').append(el('span','be-size-unit','px'));
      const toggles = el('div', 'be-type-toggles'); row.append(toggles);
      [['bold', '加粗'], ['italic', '斜体'], ['underline', '下划线']].forEach(([key, title]) => {
        const check = el('input'); check.type = 'checkbox'; check.checked = !!item[key]; check.dataset.field = key;
        check.addEventListener('change', () => updateProperty(key, check.checked));
        const label = el('label', 'be-style-toggle');label.title=title;check.setAttribute('aria-label',title); label.append(check, el('span', '', {bold:'B',italic:'I',underline:'U'}[key])); toggles.append(label);
      });
      const alignment=el('div','be-alignment');alignment.setAttribute('role','group');alignment.setAttribute('aria-label','文字对齐');typography.append(alignment);
      [['left','左对齐'],['center','居中'],['right','右对齐']].forEach(([value,label])=>{const action=button(label,()=>{updateProperty('align',value);alignment.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.align===value)));});decorateIcon(action,{'left':'text-align-start','center':'text-align-center','right':'text-align-end'}[value],true);action.dataset.align=value;action.setAttribute('aria-pressed',String((item.align||'left')===value));alignment.append(action);});
      colorField('颜色', item.color || '#174B3A', 'color', typography, value => updateProperty('color', value), false);
    } else if (item.type === 'image') {
      const content = section('图片', stylePane);
      const preview = el('img', 'be-image-preview'); preview.src = item.dataUrl; preview.alt = item.alt || '当前图片'; content.append(preview);
      const upload = el('input', 'be-input be-file'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp'; upload.dataset.field = 'image';
      upload.addEventListener('change', () => replaceImage(upload.files?.[0], activeSlide, selected, upload));
      field('替换图片', upload, content);
      content.append(el('p', 'be-note', 'PNG、JPEG、WebP，最大 15 MB。替换仅影响当前对象，请自行核对包装、Logo 和文字。'));
      selectField('图片适配', item.fit || 'contain', 'fit', [['contain', '完整显示'], ['cover', '铺满（可能裁切）']], content, value => updateProperty('fit', value));
    } else if (item.type === 'table') {
      const content = section('表格内容', stylePane);
      content.append(el('p', 'be-note', '第一行为表头。逐格编辑，保留当前行列结构。'));
      const grid = el('div', 'be-table-grid');
      grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, item.rows?.[0]?.length || 1) + ', minmax(92px, 1fr))';
      (item.rows || []).forEach((row, r) => row.forEach((value, c) => {
        const input = el('textarea', 'be-input'); input.rows = 3; input.value = value; input.dataset.field = 'cell-' + r + '-' + c;
        input.setAttribute('aria-label', '第 ' + (r + 1) + ' 行，第 ' + (c + 1) + ' 列' + (r === 0 ? '（表头）' : ''));
        input.addEventListener('input', () => mutate('cell-' + r + '-' + c, () => { object().rows[r][c] = input.value; }));
        grid.append(input);
      }));
      const scroll = el('div', 'be-table-scroll'); scroll.append(grid); content.append(scroll);
    } else if (item.type === 'chart') {
      const content = section('图表数据', stylePane);
      const chart = item.chart || {};
      inputField('系列名称', chart.seriesName, 'seriesName', content, value => mutate('seriesName', () => { object().chart.seriesName = value; }));
      inputField('单位', chart.unit, 'unit', content, value => mutate('unit', () => { object().chart.unit = value; }));
      selectField('柱形方向', chart.direction || 'column', 'direction', [['column', '纵向'], ['bar', '横向']], content, value => mutate('direction', () => { object().chart.direction = value; }));
      const grid = el('div', 'be-chart-grid'); content.append(grid);
      (chart.categories || []).forEach((category, i) => {
        inputField('类别 ' + (i + 1), category, 'category-' + i, grid, value => mutate('category-' + i, () => { object().chart.categories[i] = value; }));
        inputField('数值 ' + (i + 1), chart.values[i], 'value-' + i, grid, (value, input) => {
          const number = Number(value);
          if (value.trim() === '' || !Number.isFinite(number) || number < 0) { fieldValidity(input, '请输入不小于 0 的数字；此输入尚未应用。'); return; }
          fieldValidity(input, '');
          mutate('value-' + i, () => { object().chart.values[i] = number; });
        }, { type: 'number', min: 0, step: 'any' });
      });
      content.append(el('p', 'be-note', '当前柱形图使用非负数值。名称、单位和数据请按原始资料核对。'));
    } else if (item.type === 'rect' || item.type === 'shape') {
      const style = section('形状样式', stylePane);
      const shape = item.type === 'rect' ? item.r > 0 ? 'roundRect' : 'rect' : item.geometry;
      selectField('形状', shape, 'geometry', SHAPES, style, value => updateShapeProperty('geometry', value));
      if (shape === 'roundRect') renderCornerControls(item,style);
      if (shape !== 'line') colorField('填充颜色', item.fill || 'none', 'fill', style, value => updateShapeProperty('fill', value), true);
      colorField('描边颜色', item.stroke || 'none', 'stroke', style, value => updateShapeProperty('stroke', value), true);
      inputField('描边粗细 / px', item.strokeWidth || 0, 'strokeWidth', style, (value, input) => {
        const number = Number(value);
        if (value.trim() === '' || !Number.isFinite(number) || number < 0 || number > 20) { fieldValidity(input, '请输入 0 至 20 之间的数字；此输入尚未应用。'); return; }
        fieldValidity(input, ''); updateShapeProperty('strokeWidth', number);
      }, { type: 'number', min: 0, max: 20, step: 1 });
      if (shape === 'line') style.append(el('p', 'be-note', '直线沿对象框中线绘制，使用描边颜色与粗细。'));
    }
    const geometry = section('位置与尺寸', arrangePane);
    const grid = el('div', 'be-field-grid'); geometry.append(grid);
    const size = dimensions();
    [['x', 'X / px', 0, size.width - item.w], ['y', 'Y / px', 0, size.height - item.h], ['w', '宽度 / px', 1, size.width - item.x], ['h', '高度 / px', 1, size.height - item.y]].forEach(([key, label, min, max]) => {
      inputField(label, Math.round(item[key] * 10) / 10, key, grid, (value, input) => numericProperty(key, value, input, min, max), { type: 'number', min, max, step: 1 });
    });
    geometry.append(el('p', 'be-note', '以画布像素为单位。可拖动对象，或在画布聚焦时用方向键微调；Shift 每次移动 10 px。'));
    const layers = section('图层顺序', arrangePane);
    const layerActions = el('div', 'be-layer-actions'); layers.append(layerActions);
    [['up', '上移一层'], ['down', '下移一层'], ['front', '置于顶层'], ['back', '置于底层']].forEach(([mode, label]) => {
      const action = button(label, () => moveLayer(mode)); action.dataset.action = 'layer-' + mode;
      action.disabled = mode === 'up' || mode === 'front' ? selected === current().elements.length - 1 : selected === 0;
      layerActions.append(action);
    });
    layers.append(el('p', 'be-note', '列表越靠后，画面图层越靠上。矩形等形状可置底，避免遮住文字；页面底色始终在全部对象下方。'));
    const wasOpen=transformOpen;
    activateInspector(inspectorTab);
    transformOpen=wasOpen&&inspectorTab==='style';
    renderTransformControls(item,stylePane);
    if(transformOpen&&refs.transformPanel){refs.transformPanel.scrollTop=panelScroll;positionTransformPanel();}
  }
  function fieldValidity(input, message) {
    input.setCustomValidity(message);
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    const error = input.parentElement.querySelector('.be-field-error');
    if (error) { error.textContent = message; error.hidden = !message; }
  }
  function numericProperty(key, value, input, min, max) {
    const number = Number(value);
    const item = object();
    if (!item) return;
    const size = dimensions();
    if (key === 'x') max = size.width - item.w;
    if (key === 'y') max = size.height - item.h;
    if (key === 'w') max = size.width - item.x;
    if (key === 'h') max = size.height - item.y;
    input.min = min; input.max = max;
    if (value.trim() === '' || !Number.isFinite(number) || number < min || number > max) {
      fieldValidity(input, '请输入 ' + min + ' 至 ' + Math.max(min, Math.round(max * 10) / 10) + ' 之间的数字；此输入尚未应用。');
      return;
    }
    fieldValidity(input, ''); updateProperty(key, number);
  }
  function updateProperty(key, value) {
    if (!object() || object()[key] === value) return;
    mutate(key, () => { object()[key] = value; });
  }
  function remember(key, force) {
    const now = Date.now();
    const composite = activeSlide + ':' + selected + ':' + key;
    if (force || lastHistory.key !== composite || now - lastHistory.at > 900) {
      undoStack.push({ scene: JSON.stringify(scene), slide: activeSlide, selected });
      while (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      let bytes = undoStack.reduce((total, state) => total + state.scene.length * 2, 0);
      while (bytes > HISTORY_BYTES && undoStack.length > 1) bytes -= undoStack.shift().scene.length * 2;
    }
    lastHistory = { key: composite, at: now };
    redoStack = [];
  }
  function changed() {
    sequence++; dirty = true;
    if (online && !saveError && !conflict && !drag) {
      clearTimeout(saveTimer); saveTimer = setTimeout(() => saveNow(false), 650);
    }
    renderStatus();
  }
  function mutate(key, action) {
    remember(key); action(); changed(); renderCanvas();
    if (key === 'text') renderNavigation();
    refreshLayers();
    const meta = refs.properties.querySelector('.be-object-meta');
    if (meta && object()) meta.textContent = (TYPES[object().type] || object().type) + ' · 对象 ' + (selected + 1);
    const reset=refs.properties.querySelector('[data-action="reset-transform"]');
    if(reset&&object())reset.disabled=!(Number(object().rotation)||object().flipHorizontal||object().flipVertical);
    const radius=refs.properties.querySelector('[data-field="radius-range"]');
    if(radius&&object()){const cap=Math.min(360,object().w/2,object().h/2);radius.max=String(cap);radius.value=String(Math.min(object().r??16,cap));const input=refs.properties.querySelector('[data-field="r"]');if(input){input.max=String(cap);if(input!==document.activeElement)input.value=radius.value;}}
    if (refs.backgroundNote) refs.backgroundNote.hidden = !backgroundHasImage();
  }
  function restoreHistory(from, to, message) {
    if (!from.length || drag) return;
    to.push({ scene: JSON.stringify(scene), slide: activeSlide, selected });
    while (to.length > HISTORY_LIMIT) to.shift();
    const old = from.pop(); scene = JSON.parse(old.scene); activeSlide = old.slide; selected = old.selected;
    lastHistory = { key: '', at: 0 }; changed(); renderNavigation(); renderCanvas(); renderProperties(); announce(message);
  }
  function undo() { restoreHistory(undoStack, redoStack, '已撤销'); }
  function redo() { restoreHistory(redoStack, undoStack, '已重做'); }
  async function readImage(file, upload, verb) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      announce(`图片未${verb}：请选择不超过 15 MB 的 PNG、JPEG 或 WebP 文件。`);
      upload.setCustomValidity('请选择不超过 15 MB 的 PNG、JPEG 或 WebP 文件'); upload.reportValidity(); return;
    }
    upload.disabled = true;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('无法读取图片')); reader.readAsDataURL(file);
      });
      const dimensions = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve({width:img.naturalWidth,height:img.naturalHeight}); img.onerror = () => reject(Error('图片文件无法解码')); img.src = dataUrl; });
      upload.setCustomValidity('');
      return {dataUrl,...dimensions};
    } finally { upload.disabled = false; }
  }
  async function insertImage(file, upload) {
    if (!file) return;
    if (current().elements.length >= ELEMENT_LIMIT) { announce('图片未插入：每页最多 250 个对象，请先删除不需要的对象。'); return; }
    const pageIndex = activeSlide;
    try {
      const loaded = await readImage(file, upload, '插入'); if (!loaded) return;
      if (activeSlide !== pageIndex) throw Error('页面已改变，请在目标页重新插入图片');
      const canvas = dimensions(), factor = Math.min(520 / loaded.width, 360 / loaded.height, 1);
      const w = Math.max(1, loaded.width * factor), h = Math.max(1, loaded.height * factor);
      const offset = (current().elements.length % 5) * 16;
      const x = Math.max(0, Math.min(canvas.width - w, (canvas.width - w) / 2 + offset));
      const y = Math.max(0, Math.min(canvas.height - h, (canvas.height - h) / 2 + offset));
      const item = {type:'image',x,y,w,h,dataUrl:loaded.dataUrl,fit:'contain',alt:file.name,source:'用户在编辑器中插入：'+file.name,kind:'user-upload',rotation:0,flipHorizontal:false,flipVertical:false};
      structuralMutation('insert-image', () => { current().elements.push(item); selected = current().elements.length - 1; });
      announce('图片已插入并位于最上层，请核对画面、裁切与包装内容。');
      refs.stage.focus({preventScroll:true});
    } catch (error) { announce('图片未插入：' + error.message); }
  }
  async function replaceImage(file, pageIndex, elementIndex, upload) {
    if (!file) return;
    const target = scene.slides[pageIndex]?.elements[elementIndex];
    try {
      const loaded = await readImage(file, upload, '替换'); if (!loaded) return;
      if (scene.slides[pageIndex]?.elements[elementIndex] !== target) throw Error('页面已改变，请重新选择图片');
      remember('image', true);
      target.dataUrl = loaded.dataUrl; target.alt = file.name; target.source = '用户在编辑器中替换：' + file.name;
      delete target.sourcePath;
      if ('packagingVerified' in target) target.packagingVerified = false;
      changed(); renderCanvas(); renderProperties(); announce('图片已替换，请核对画面及包装内容。');
    } catch (error) { announce('图片未替换：' + error.message); }
  }
  function pointerDown(event) {
    if (present || event.button !== 0) return;
    const handle=event.target.closest('[data-resize]');
    if(handle && transformable(object())) {
      event.preventDefault(); refs.stage.focus({preventScroll:true}); clearTimeout(saveTimer);
      const item=object(); scaleBase(item);
      drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,item,base:clone(item),priorRedo:redoStack.slice(),resize:handle.dataset.resize,moved:false,target:refs.stage.querySelector('.element[data-element="'+selected+'"]')};
      refs.stage.setPointerCapture(event.pointerId);return;
    }
    const target = event.target.closest('.element');
    if (!target) { select(null); return; }
    const index = Number(target.dataset.element);
    if (!Number.isInteger(index) || !current().elements[index]) return;
    event.preventDefault(); select(index); refs.stage.focus({ preventScroll: true });
    clearTimeout(saveTimer);
    const item = object();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y, moved: false, item, target };
    refs.stage.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = (event.clientX - drag.startX) / scale, dy = (event.clientY - drag.startY) / scale;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
    if (!drag.moved) { remember('drag', true); drag.moved = true; }
    if (drag.resize) {
      const b=drag.base, angle=(Number(b.rotation)||0)*Math.PI/180;
      const localX=dx*Math.cos(angle)+dy*Math.sin(angle),localY=-dx*Math.sin(angle)+dy*Math.cos(angle);
      const sx=drag.resize.includes('e')?1:drag.resize.includes('w')?-1:0;
      const sy=drag.resize.includes('s')?1:drag.resize.includes('n')?-1:0;
      const multiplier=event.altKey?2:1;
      let w=b.w+sx*localX*multiplier,h=b.h+sy*localY*multiplier;
      if(proportionsLocked!==event.shiftKey){const f=sx&&sy?(Math.abs(w/b.w-1)>=Math.abs(h/b.h-1)?w/b.w:h/b.h):sx?w/b.w:h/b.h;w=b.w*f;h=b.h*f;}
      const anchor=event.altKey?[.5,.5]:[sx?(1-sx)/2:.5,sy?(1-sy)/2:.5];
      // Stop at the existing document bounds rather than producing an unsavable scene.
      let p=resized(b,w,h,anchor);
      if(!validResize(p)){let low=0,high=1;for(let i=0;i<30;i++){const mid=(low+high)/2;const trial=resized(b,b.w+(w-b.w)*mid,b.h+(h-b.h)*mid,anchor);if(validResize(trial))low=mid;else high=mid;}p=resized(b,b.w+(w-b.w)*low,b.h+(h-b.h)*low,anchor);}
      applyResize(drag.item,p);
      const slide=refs.stage.querySelector('.slide');slide.outerHTML=window.BenchunRenderer.renderSlide(current(),activeSlide,scene);
      updateSelection();syncTransformValues();return;
    }
    const size = dimensions();
    drag.item.x = Math.round(Math.max(0, Math.min(size.width - drag.item.w, drag.x + dx)));
    drag.item.y = Math.round(Math.max(0, Math.min(size.height - drag.item.h, drag.y + dy)));
    drag.target.style.left = drag.item.x + 'px'; drag.target.style.top = drag.item.y + 'px';
    updateSelection();
    ['x', 'y'].forEach(key => { const input = refs.properties.querySelector('[data-field="' + key + '"]'); if (input) input.value = drag.item[key]; });
  }
  function pointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved; drag = null;
    if (refs.stage.hasPointerCapture(event.pointerId)) refs.stage.releasePointerCapture(event.pointerId);
    if (moved) { changed(); renderCanvas(); renderProperties(); }
    else if (online && dirty && !saveError && !conflict) saveTimer = setTimeout(() => saveNow(false), 650);
  }
  function cancelDrag() {
    if(!drag)return;
    const active=drag;drag=null;
    if(active.moved){const prev=undoStack.pop();if(prev){scene=JSON.parse(prev.scene);activeSlide=prev.slide;selected=prev.selected;}lastHistory={key:'',at:0};}
    if(active.priorRedo)redoStack=active.priorRedo;
    if(refs.stage.hasPointerCapture(active.id))refs.stage.releasePointerCapture(active.id);
    renderCanvas();renderProperties();renderStatus();
    if(online&&dirty&&!saveError&&!conflict)saveTimer=setTimeout(()=>saveNow(false),650);
    announce('已取消本次变换。');
  }
  function renderStatus() {
    refs.undo.disabled = undoStack.length === 0;
    refs.redo.disabled = redoStack.length === 0;
    refs.insertButtons.forEach(node => { node.disabled = current().elements.length >= ELEMENT_LIMIT; node.title = node.disabled ? '每页最多 250 个对象，请先删除不需要的对象' : ''; });
    refs.status.dataset.state = conflict || saveError ? 'error' : saving ? 'saving' : dirty || saveWarning ? 'dirty' : 'saved';
    refs.status.textContent = conflict ? '版本冲突 · 本页草稿已保留' : saveError ? '保存失败 · 草稿仍在本页' : saving ? '正在保存…' : dirty ? online ? '有未保存修改' : '未保存 · 请下载 HTML' : saveWarning ? '场景已保存 · HTML 副本待更新' : online ? '已保存 · 版本 ' + displayRevision(revision) : '离线副本';
    refs.status.title = online ? '完整版本号：' + revision : '当前为离线 HTML 副本';
    refs.save.disabled = !!saving || conflict;
    refs.save.textContent = online ? saving ? '保存中…' : saveError ? '重试保存' : '保存' : '保存 HTML';
    refs.pptx.disabled = !online || exportBusy || !!saveError || conflict;
    refs.pdf.disabled = online && (exportBusy || !!saveError || conflict);
    renderMessages();
  }
  function renderMessages() {
    refs.messages.replaceChildren();
    refs.messages.hidden = !saveError && !conflict && !exportText && !saveWarning;
    if (saveError || conflict) {
      const error = el('div', 'be-message be-message-error'); error.setAttribute('role', 'alert');
      error.append(el('span', '', conflict ? '文件已被其他窗口修改。当前草稿不会被覆盖；先下载备份，再载入服务端版本。' : '无法保存：' + saveError + '。当前草稿保留在此页，导出已暂停。'));
      const actions = el('div', 'be-message-actions'); actions.append(button('下载草稿 HTML', downloadHTML));
      actions.append(conflict ? button('载入服务端版本', reloadServer) : button('重试保存', () => saveNow(true)));
      error.append(actions); refs.messages.append(error);
    }
    if (saveWarning && !saveError && !conflict) {
      const warning = el('div', 'be-message be-message-warning');
      warning.append(el('span', '', '场景数据已保存，但 HTML 副本更新有提示：' + saveWarning + '。可下载当前 HTML 作为备份。'));
      warning.append(button('下载当前 HTML', downloadHTML)); refs.messages.append(warning);
    }
    if (exportText) {
      const message = el('div', 'be-message');
      message.append(el('span', '', exportText));
      if (exportBusy) { const progress = el('progress', 'be-export-progress'); progress.setAttribute('aria-label', '正在生成导出文件'); message.append(progress); }
      if (exportLink) { const link = el('a', 'be-button', '下载导出文件'); link.href = exportLink; link.download = ''; message.append(link); }
      refs.messages.append(message);
    }
  }
  async function request(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', headers: { 'X-Benchun-Token': session.token, ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers } });
      let data; try { data = await response.json(); } catch (_) { data = {}; }
      if (!response.ok) { const error = Error(data.error || '服务返回 ' + response.status); error.status = response.status; throw error; }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('连接超时，请确认本地编辑服务仍在运行');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function saveNow(explicit) {
    clearTimeout(saveTimer);
    if (drag) { if (explicit) announce('请先完成当前拖动，再保存。'); return false; }
    if (!online) { if (explicit) downloadHTML(); return true; }
    if (conflict || (!explicit && saveError)) return false;
    if (saving) return saving;
    if (!dirty) { if (explicit) announce('当前文稿已保存。'); return true; }
    const capturedSequence = sequence;
    const snapshot = clone(scene);
    const expectedRevision = revision;
    if (explicit) saveError = '';
    saving = (async () => {
      try {
        const result = await request('/api/save', { method: 'POST', body: JSON.stringify({ scene: snapshot, revision: expectedRevision }) });
        if (result.revision === undefined || result.revision === null) throw Error('保存响应缺少版本号，请先下载草稿备份');
        revision = result.revision;
        dirty = sequence !== capturedSequence;
        saveWarning = result.warning ? String(result.warning) : '';
        saveError = ''; return true;
      } catch (error) {
        dirty = true; saveError = error.message || '网络不可用'; conflict = error.status === 409; return false;
      } finally {
        saving = null; renderStatus();
        if (dirty && !saveError && !conflict) saveTimer = setTimeout(() => saveNow(false), 100);
      }
    })();
    renderStatus();
    return saving;
  }
  async function reloadServer() {
    if (!confirm('载入服务端版本会替换当前页面的未保存草稿。请确认已下载草稿 HTML 备份。继续吗？')) return;
    const capturedSequence = sequence;
    try {
      const state = await request('/api/state');
      if (!Array.isArray(state.scene?.slides) || !state.scene.slides.length || state.revision === undefined) throw Error('服务端文件格式无效');
      if (sequence !== capturedSequence || drag) throw Error('读取期间又有新编辑，已保留当前草稿；请再次载入');
      scene = state.scene; revision = state.revision; sequence++; dirty = false; conflict = false; saveError = ''; saveWarning = ''; undoStack = []; redoStack = [];
      activeSlide = Math.min(activeSlide, scene.slides.length - 1); selected = null;
      clearTimeout(saveTimer); renderNavigation(); renderCanvas(); renderProperties(); renderStatus(); announce('已载入服务端版本。');
    } catch (error) { saveError = error.message; renderStatus(); }
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = el('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function safeFilename() { return String(scene.title || '本纯魔法演示').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100); }
  function downloadHTML() {
    const doc = document.documentElement.cloneNode(true);
    const data = doc.querySelector('#benchun-scene');
    data.textContent = JSON.stringify(scene).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    doc.querySelectorAll('#benchun-session, [data-benchun-session]').forEach(node => node.remove());
    doc.querySelector('#print-deck')?.remove();
    doc.querySelectorAll('script:not(#benchun-scene)').forEach(node => {
      if (node.textContent.length < 2000 && /(?:window\.)?__BENCHUN_SESSION__\s*=/.test(node.textContent)) node.remove();
    });
    const snapshotApp = doc.querySelector('#app'); snapshotApp.replaceChildren(); snapshotApp.removeAttribute('class');
    doc.querySelector('body')?.classList.remove('be-presenting');
    doc.classList.remove('be-presenting');
    const title = doc.querySelector('title'); if (title) title.textContent = scene.title || '本纯魔法演示';
    downloadBlob(new Blob(['<!doctype html>\n' + doc.outerHTML], { type: 'text/html;charset=utf-8' }), safeFilename() + '-可编辑.html');
    if (!online) { dirty = false; renderStatus(); }
    announce('已请求下载 HTML，请在浏览器下载列表确认文件。');
  }
  function preparePrint() {
    if (document.getElementById('print-deck')) return;
    const deck = el('main'); deck.id = 'print-deck';
    deck.innerHTML = scene.slides.map((slide, index) => window.BenchunRenderer.renderSlide(slide, index, scene)).join('');
    document.body.append(deck);
  }
  async function printAllSlides() {
    preparePrint();
    await Promise.all(Array.from(document.querySelectorAll('#print-deck img')).map(img => img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    window.print();
  }
  async function exportDocument(format) {
    if (!online || exportBusy || saveError || conflict) return;
    const invalid=refs.properties.querySelector('[aria-invalid="true"]');
    if(invalid) { announce('请先修正属性面板中标记的无效数值，再导出。');activateInspector(invalid.closest('.be-inspector-pane')?.dataset.pane||'style');const toggle=invalid.closest('.be-disclosure')?.querySelector('.be-disclosure-toggle');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();invalid.focus();invalid.reportValidity();return; }
    exportBusy = true; exportLink = null; exportText = '正在保存最新修改，随后生成 ' + format.toUpperCase() + '…'; renderStatus();
    try {
      while (dirty || saving) {
        if (!(await saveNow(true))) throw Error('保存未成功；请先处理保存提示');
      }
      exportingRevision = revision;
      const job = await request('/api/export', { method: 'POST', body: JSON.stringify({ format, revision: exportingRevision }) });
      if (!job.id) throw Error('导出服务未返回任务编号');
      exportText = '正在生成 ' + format.toUpperCase() + ' · 版本 ' + displayRevision(exportingRevision) + '。可继续编辑，后续修改不包含在本次导出中。'; renderMessages();
      const started = Date.now();
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await request('/api/jobs/' + encodeURIComponent(job.id));
        if (result.status === 'error') throw Error(result.error || '生成失败');
        if (result.status === 'done') {
          if (!result.url) throw Error('导出完成，但没有下载地址');
          const url = new URL(result.url, location.href);
          if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) throw Error('导出服务返回了非本地下载地址');
          exportLink = url.href; exportText = format.toUpperCase() + ' 已生成 · 版本 ' + displayRevision(result.revision ?? exportingRevision) + (dirty || revision !== exportingRevision ? '。当前页面已有更新，需再次导出才能包含。' : '。');
          break;
        }
        if (Date.now() - started > 5 * 60 * 1000) throw Error('生成超过 5 分钟，请确认本地服务状态后重试');
      }
    } catch (error) { exportText = '导出未完成：' + error.message + '。文稿未被替换。'; }
    finally { exportBusy = false; renderStatus(); }
  }
  function setPresent(value) {
    if(value){closeTransformPanel();closeMenus();}
    present = value; document.body.classList.toggle('be-presenting', present);
    updateSelection(); requestAnimationFrame(fitCanvas);
    if (present) refs.presentation.querySelector('button:last-child').focus(); else refs.stage.focus({ preventScroll: true });
  }
  function keydown(event) {
    const modifier = event.ctrlKey || event.metaKey;
    const inputTarget = event.target.closest('input,textarea,select,[contenteditable="true"]');
    if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); online ? saveNow(true) : downloadHTML(); return; }
    if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') { if(openMenus.size){event.preventDefault();closeMenus(true);} else if(drag){event.preventDefault();cancelDrag();} else if(transformOpen){event.preventDefault();closeTransformPanel(true);} else if (present) setPresent(false); else select(null); return; }
    if(event.key==='Enter'&&drag){event.preventDefault();pointerUp({pointerId:drag.id});return;}
    if (inputTarget) return;
    if (!present && object() && refs.stage.contains(document.activeElement)) {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteObject(); return; }
      if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateObject(); return; }
    }
    if (present && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') setSlide(0); else if (event.key === 'End') setSlide(scene.slides.length - 1); else go(['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key) ? -1 : 1);
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); go(event.key === 'PageUp' ? -1 : 1); return; }
    if (object() && refs.stage.contains(document.activeElement) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const step = event.shiftKey ? 10 : 1; const size = dimensions();
      mutate('keyboard-move', () => { const item = object(); item.x = Math.max(0, Math.min(size.width - item.w, item.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))); item.y = Math.max(0, Math.min(size.height - item.h, item.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))); });
      renderProperties();
    }
  }
  selected=scene.slides[0].elements.findIndex(item=>item.type==='text'&&item.role==='title');if(selected<0)selected=null;
  buildShell(); renderNavigation(); renderCanvas(); renderProperties(); renderStatus();
  refs.stage.addEventListener('pointermove', pointerMove);
  refs.stage.addEventListener('pointerup', pointerUp);
  refs.stage.addEventListener('pointercancel', cancelDrag);
  document.addEventListener('keydown', keydown);
  document.addEventListener('pointerdown',event=>{
    if(openMenus.size&&![...openMenus].some(menu=>menu.panel.contains(event.target)||menu.trigger.contains(event.target)))closeMenus();
    if(transformOpen&&!refs.transformPanel?.contains(event.target)&&!refs.transformTrigger?.contains(event.target))closeTransformPanel();
  },true);
  window.addEventListener('resize',positionTransformPanel);
  refs.properties.addEventListener('scroll',positionTransformPanel,{passive:true});
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', () => document.getElementById('print-deck')?.remove());
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitCanvas).observe(refs.viewport);
  window.addEventListener('beforeunload', event => { if (dirty || saving || drag?.moved) { event.preventDefault(); event.returnValue = ''; } });
  window.benchunEditor = Object.freeze({ getState: () => ({ scene: clone(scene), revision, dirty, saving: !!saving, saveError, saveWarning, conflict, online, activeSlide, selected, scale, undoCount: undoStack.length, redoCount: redoStack.length, exportBusy, exportText, exportLink, present }) });
})();
