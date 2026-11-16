import type { buildAtlas } from '../src/engine/atlas.ts';

export type BranchMapView = ReturnType<typeof buildAtlas>;

export interface BranchMapOptions {
  readonly load: () => Promise<BranchMapView>;
  readonly restart: (key: string) => Promise<void>;
  readonly paintThumbnail: (target: HTMLElement, thumbnail: NonNullable<BranchMapView['nodes'][number]['thumbnail']>) => Promise<void>;
}

const KIND = { chapter: '장 통과', alternative: '독립 결말', failure: '조기 실패', variation: '차분' } as const;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 고정 도구 줄과 오른쪽 기록을 두고, 지도 영역만 가로·세로로 이동한다. */
export async function openBranchMap(options: BranchMapOptions): Promise<void> {
  if (document.querySelector('.branch-map')) return;
  const view = await options.load();
  if (!document.querySelector('link[data-branch-map]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/branch-map.css';
    style.dataset.branchMap = '';
    document.head.append(style);
  }
  const dialog = element('dialog', 'branch-map');
  const heading = element('h2', 'branch-map-title', '분기 맵');
  heading.id = 'branch-map-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const header = element('header', 'branch-map-header');
  const close = element('button', 'branch-map-close', '닫기');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  header.append(heading, close);

  const toolbar = element('div', 'branch-map-toolbar');
  const chapters = element('nav', 'branch-map-chapters');
  chapters.setAttribute('aria-label', '장');
  const legend = element('div', 'branch-map-legend');
  for (const [className, label] of [['current', '현재 위치'], ['path', '이번 판'], ['seen', '다른 판'], ['unseen', '미발견']] as const) {
    legend.append(element('span', `branch-map-key ${className}`, label));
  }
  const tools = element('div', 'branch-map-tools');
  const zoomOut = element('button', '', '−');
  zoomOut.setAttribute('aria-label', '축소');
  const zoomIn = element('button', '', '+');
  zoomIn.setAttribute('aria-label', '확대');
  const overview = element('button', '', '전체');
  const current = element('button', '', '현재 위치');
  const zoomLabel = element('output', 'branch-map-zoom');
  tools.append(current, zoomOut, zoomLabel, zoomIn, overview);
  toolbar.append(chapters, legend, tools);

  const body = element('div', 'branch-map-body');
  const viewport = element('div', 'branch-map-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', '분기 흐름');
  const size = element('div', 'branch-map-size');
  const canvas = element('div', 'branch-map-canvas');
  size.append(canvas);
  viewport.append(size);
  const detail = element('aside', 'branch-map-detail');
  detail.setAttribute('aria-label', '장면과 결말 기록');
  body.append(viewport, detail);
  const status = element('p', 'branch-map-status');
  status.setAttribute('role', 'status');
  dialog.append(header, toolbar, body, status);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      .filter((node) => node.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    const next = event.shiftKey && document.activeElement === first ? last
      : !event.shiftKey && document.activeElement === last ? first : undefined;
    if (next) {
      event.preventDefault();
      next.focus();
    }
  });
  dialog.showModal();
  close.focus();

  let chapter = view.nodes.find((node) => node.current)?.chapter ?? view.chapters[0]?.key ?? '01';
  let selected = view.nodes.find((node) => node.current)?.key ?? view.nodes.find((node) => node.label !== null)?.key ?? '';
  let scale = 1;
  let width = 1;
  let height = 1;
  let expanded = false;
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const buttons = new Map<string, HTMLButtonElement>();

  const applyScale = () => {
    canvas.style.transform = `scale(${scale})`;
    size.style.width = `${width * scale}px`;
    size.style.height = `${height * scale}px`;
    zoomLabel.value = `${Math.round(scale * 100)}%`;
    for (const button of buttons.values()) button.style.fontSize = `${Math.max(14, 14 / scale)}px`;
    zoomOut.disabled = scale <= 0.55;
    zoomIn.disabled = scale >= 1.8;
  };
  const fit = () => {
    scale = Math.min(1, Math.max(0.75, (viewport.clientWidth - 32) / width));
    applyScale();
    viewport.scrollTo({ left: 0, top: 0 });
  };
  const showDetail = () => {
    detail.replaceChildren();
    const node = view.nodes.find((candidate) => candidate.key === selected);
    const name = element('h3', 'branch-map-scene', node?.label ?? '미발견');
    if (node?.thumbnail) {
      const preview = element('div', 'branch-map-preview');
      detail.append(preview);
      void options.paintThumbnail(preview, node.thumbnail).catch(reportError);
    }
    detail.append(name);
    if (node?.current) detail.append(element('p', 'branch-map-location', view.currentScene ? `현재 위치 · ${view.currentScene}` : '현재 위치'));
    if (node?.kind) detail.append(element('p', 'branch-map-kind', KIND[node.kind]));
    if (node?.checkpoints.length) {
      const label = element('label', 'branch-map-run-label', '방문 기록');
      const select = element('select', 'branch-map-run');
      select.setAttribute('aria-label', '재시작할 방문 기록');
      node.checkpoints.forEach((point, i) => {
        const option = element('option', '', `${point.run}번째 판${node.checkpoints.filter((other) => other.run === point.run).length > 1 ? ` · 방문 ${i + 1}` : ''}`);
        option.value = point.key;
        option.disabled = !point.ready;
        select.append(option);
      });
      const ready = node.checkpoints.findLast((point) => point.ready);
      if (ready) select.value = ready.key;
      const restart = element('button', 'branch-map-restart', '여기서 다시 시작');
      restart.disabled = ready === undefined;
      restart.addEventListener('click', async () => {
        restart.disabled = true;
        status.textContent = '';
        try {
          await options.restart(select.value);
          dialog.close();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : '다시 시작하지 못했습니다. 분기 맵을 다시 열어 주세요.';
          restart.disabled = false;
        }
      });
      label.append(select);
      detail.append(label, restart);
    }
    const arrivals = view.arrivals.filter((arrival) => arrival.chapter === chapter);
    const collection = element('section', 'branch-map-collection');
    collection.append(element('h3', '', `도달 ${arrivals.filter((arrival) => arrival.reached).length}/${arrivals.length}`));
    for (const arrival of arrivals.filter((candidate) => candidate.reached)) {
      const item = element('div', `branch-map-arrival${arrival.reached ? ' reached' : ''}`);
      item.append(element('span', 'branch-map-arrival-name', arrival.label ?? '미발견'));
      if (arrival.kind) item.append(element('span', 'branch-map-arrival-kind', KIND[arrival.kind]));
      for (const variation of arrival.variants) item.append(element('span', 'branch-map-variation', variation));
      collection.append(item);
    }
    const undiscovered = arrivals.filter((arrival) => !arrival.reached).length;
    if (undiscovered) collection.append(element('div', 'branch-map-arrival', `미발견 ${undiscovered}`));
    detail.append(collection);
  };
  const choose = (key: string) => {
    selected = key;
    for (const [buttonKey, button] of buttons) button.setAttribute('aria-pressed', String(buttonKey === key));
    showDetail();
  };
  const draw = () => {
    canvas.replaceChildren();
    positions.clear();
    buttons.clear();
    for (const button of chapters.querySelectorAll('button')) button.setAttribute('aria-current', button.dataset.chapter === chapter ? 'page' : 'false');
    const inChapter = view.nodes.filter((node) => node.chapter === chapter);
    const reached = new Set(view.nodes.filter((node) => node.label !== null).map((node) => node.key));
    const frontier = new Set(view.edges.filter((edge) => reached.has(edge.from)).map((edge) => edge.to));
    const nodes = inChapter.filter((node) => expanded || node.label !== null || frontier.has(node.key));
    const rows = [...new Set(nodes.map((node) => node.row))].sort((a, b) => a - b);
    const cols = [...new Set(nodes.map((node) => node.col))].sort((a, b) => a - b);
    const pitch = 220;
    const nodeWidth = 172;
    const nodeHeight = 132;
    const rowPitch = 184;
    width = Math.max(440, cols.length * pitch + 40);
    height = Math.max(280, rows.length * rowPitch + 56);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'branch-map-lines');
    svg.setAttribute('aria-hidden', 'true');
    for (const node of nodes) {
      const junction = node.thumbnail === null && node.label !== null;
      positions.set(node.key, {
        x: cols.indexOf(node.col) * pitch + 28 + (junction ? (nodeWidth - 48) / 2 : 0),
        y: rows.indexOf(node.row) * rowPitch + 28 + (junction ? (nodeHeight - 48) / 2 : 0),
        w: junction ? 48 : nodeWidth, h: junction ? 48 : nodeHeight,
      });
    }
    const weight = (edge: BranchMapView['edges'][number]) => edge.onPath ? 2 : edge.seen ? 1 : 0;
    for (const edge of [...view.edges].sort((a, b) => weight(a) - weight(b))) {
      const a = positions.get(edge.from);
      const b = positions.get(edge.to);
      if (!a || !b) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      if (a.x === b.x) {
        const down = b.y > a.y;
        path.setAttribute('d', `M${a.x + a.w / 2},${a.y + (down ? a.h : 0)} V${b.y + (down ? 0 : b.h)}`);
      } else {
        // 긴 분기도 출발 열 바로 옆 빈 통로에서 꺾어 중간 노드를 지나지 않는다.
        const gap = a.x + a.w + (pitch - nodeWidth) / 2;
        path.setAttribute('d', `M${a.x + a.w},${a.y + a.h / 2} H${gap} V${b.y + b.h / 2} H${b.x}`);
      }
      path.setAttribute('class', edge.onPath ? 'path' : edge.seen ? 'seen' : 'unseen');
      svg.append(path);
    }
    canvas.append(svg);
    for (const node of nodes) {
      const at = positions.get(node.key);
      if (!at) continue;
      const button = element('button', `branch-map-node${node.thumbnail === null && node.label !== null ? ' junction' : ''}${node.label === null ? ' unseen' : ''}${node.onPath ? ' path' : ''}${node.current ? ' current' : ''}`);
      button.dataset.key = node.key;
      button.style.left = `${at.x}px`;
      button.style.top = `${at.y}px`;
      button.style.width = `${at.w}px`;
      button.style.height = `${at.h}px`;
      const image = element('span', 'branch-map-thumbnail');
      if (node.thumbnail) void options.paintThumbnail(image, node.thumbnail).catch(reportError);
      else image.textContent = node.label === null ? '?' : '◇';
      button.append(image);
      button.append(element('span', 'branch-map-node-label', node.label ?? '미발견'));
      if (node.current) {
        button.setAttribute('aria-current', 'step');
        button.append(element('span', 'branch-map-pin', '현재'));
      }
      if (node.kind) button.dataset.kind = node.kind;
      button.addEventListener('click', () => choose(node.key));
      buttons.set(node.key, button);
      canvas.append(button);
    }
    if (nodes.length === 0) canvas.append(element('p', 'branch-map-empty', '아직 방문한 장면이 없습니다.'));
    choose(selected);
    fit();
    overview.textContent = expanded ? '접기' : '전체';
  };
  for (const item of view.chapters) {
    const button = element('button', '', item.label);
    button.dataset.chapter = item.key;
    button.addEventListener('click', () => {
      chapter = item.key;
      selected = view.nodes.find((node) => node.chapter === chapter && node.current)?.key ?? view.nodes.find((node) => node.chapter === chapter && node.label !== null)?.key ?? '';
      draw();
    });
    chapters.append(button);
  }
  zoomOut.addEventListener('click', () => { scale = Math.max(0.55, scale - 0.2); applyScale(); });
  zoomIn.addEventListener('click', () => { scale = Math.min(1.8, scale + 0.2); applyScale(); });
  overview.addEventListener('click', () => { expanded = !expanded; draw(); });
  current.disabled = !view.nodes.some((node) => node.current);
  current.addEventListener('click', () => {
    const node = view.nodes.find((candidate) => candidate.current);
    if (!node) return;
    if (chapter !== node.chapter) {
      chapter = node.chapter;
      draw();
    }
    choose(node.key);
    buttons.get(node.key)?.scrollIntoView({ block: 'center', inline: 'center' });
    buttons.get(node.key)?.focus({ preventScroll: true });
  });
  draw();
}
