"use client";

/* eslint-disable @next/next/no-img-element */
/*
 * Проигрыватель предсказанной активности коры по секундам (TRIBE v2).
 * Данные: /brain/cortex/meta.json, fs6.bin, ico7.bin  кора fsaverage в двух уровнях детализации
 *           (см. es/tribe/viz/export_mesh_fs6.py). Клиент сам делит треугольники fs5 -> fs6 -> ico7
 *           (сетки fsaverage вложенные: новая вершина в середине ребра), из файлов берёт только поправки
 *           позиций, тон извилин и запечённое затенение впадин (AO).
 *         /brain/timeseries/index.json {anchors, exercises: [{id, title_ru, title_en, frames, fps, start_s, zones}]}
 *         /brain/timeseries/<id>.bin  uint8, кадр за кадром по 20484 вершины fs5, (z + 2) / 4 * 255, 128 = средний отклик
 * Кадр fs5 слегка сглаживается, переносится на fs6 и ещё раз сглаживается; цвет считает шейдер по текстуре
 * значений fs6 (ico7 берёт середину ребра), поэтому края зон плавные на любой сетке.
 * Сначала показываем fs6 (быстрый первый кадр), на десктопе потом подменяем на ico7 (327 тыс. вершин).
 * Three.js и данные грузятся только при приближении к блоку.
 * Без WebGL2, при prefers-reduced-motion или ошибке загрузки: статичная картинка.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "./i18n";

type ZoneKey = "language" | "auditory";
type Zones = { language: number[]; auditory: number[]; visual?: number[] };
type Ex = { id: string; title_ru: string; title_en: string; frames: number; fps: number; start_s: number; zones: Zones };
type Index = { vertices: number; anchors: Record<string, number>; exercises: Ex[] };
type Chunk = { offset: number; length: number; type: string };
type Meta = {
  step_mm: number;
  center: number[];
  fs5_per_hemi: number;
  counts: { fs5: number; fs6: number; ico7: number };
  anchors?: Partial<Record<ZoneKey, number>>;
  fs6: { file: string; chunks: Record<"faces5" | "q5" | "d6" | "tone" | "ao", Chunk> };
  ico7: { file: string; chunks: Record<"d7" | "tone" | "ao", Chunk> };
};
type Edges = { eA: Uint32Array; eB: Uint32Array; fe: Uint32Array };
/** Один уровень детализации в порядке вершин клиента: 0..20483 fs5, дальше новые вершины по уровням. */
type Lod = { nv: number; q: Int32Array; hemi: Uint8Array; faces: Uint32Array | Uint16Array; tone: Uint8Array; ao: Uint8Array };
type Cortex = { meta: Meta; n5: number; e5: Edges; e6: Edges; fs6: Lod };
const ZONES: ZoneKey[] = ["language", "auditory"];

export type BrainPlayerText = {
  group: string;
  play: string;
  pause: string;
  time: string;
  sec: string;
  of: string;
  low: string;
  high: string;
  zones: Record<ZoneKey, string>;
  levels: [string, string, string];
  caption: string;
  loading: string;
  alt: string;
  drag: string;
};

const BASE = "/brain/timeseries";
const CORTEX = "/brain/cortex";
const MORPH_MS = 600;
const COLOR_STEP_MS = 33; // значения пересчитываем не чаще 30 раз в секунду
const GAIN = 1.5; // контраст показа: полная шкала цвета при z около 1.3, обрезка как у данных
const SMOOTH = 0.5; // доля среднего по соседям за проход: два прохода на fs5 и один на fs6
const TEX_W = 1024; // ширина текстуры значений fs6

const hex = (h: number) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const lin = (c: number[]) => c.map((v) => Math.pow(v, 2.2)); // цвета в шейдере линейные
// подложка: борозды темнее, извилины светлее
const SULCUS = lin(hex(0x7f8a92));
const GYRUS = lin(hex(0xe2e7ea));
// активность выше среднего: бирюзовый Siriva, тёплый янтарь, коралл; ниже среднего прозрачно.
// Переход бирюза -> янтарь короткий и в линейном свете, чтобы не было болотного оттенка посередине
const RAMP = [lin(hex(0x1c8a7a)), lin(hex(0x2a9a88)), lin(hex(0xe3a64a)), lin(hex(0xdc6a4f))];
const STOPS = [0.46, 0.62, 1];

function webglOk() {
  try {
    // three.js r170 работает только с WebGL2
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/** ico7 только там, где есть запас: широкий экран, нет экономии трафика, памяти от 4 ГБ. */
function wantIco7(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if (window.matchMedia("(max-width: 559px)").matches) return false;
  return (nav.deviceMemory ?? 8) >= 4;
}

const getJson = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r.status)));
const getBuf = (url: string) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)));

function view(buf: ArrayBuffer, c: Chunk) {
  if (c.type === "int8") return new Int8Array(buf, c.offset, c.length);
  if (c.type === "int16") return new Int16Array(buf, c.offset, c.length);
  if (c.type === "uint16") return new Uint16Array(buf, c.offset, c.length);
  return new Uint8Array(buf, c.offset, c.length);
}

/**
 * Рёбра в порядке первой встречи: грани по очереди, у грани (a,b,c) рёбра ab, bc, ca, ключ (min, max).
 * Правило общее с export_mesh_fs6.py: от него зависит нумерация новых вершин.
 */
function edgeTable(faces: ArrayLike<number>): Edges {
  const F = faces.length / 3;
  let cap = 1;
  while (cap < F * 3) cap <<= 1;
  const mask = cap - 1;
  const kA = new Int32Array(cap).fill(-1), kB = new Int32Array(cap), id = new Int32Array(cap);
  const eA = new Uint32Array(F * 3), eB = new Uint32Array(F * 3), fe = new Uint32Array(F * 3);
  let ne = 0;
  for (let f = 0; f < F; f++)
    for (let k = 0; k < 3; k++) {
      let a = faces[f * 3 + k], b = faces[f * 3 + (k === 2 ? 0 : k + 1)];
      if (a > b) [a, b] = [b, a];
      let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) & mask;
      while (kA[h] !== -1 && (kA[h] !== a || kB[h] !== b)) h = (h + 1) & mask;
      if (kA[h] === -1) {
        kA[h] = a;
        kB[h] = b;
        id[h] = ne;
        eA[ne] = a;
        eB[ne] = b;
        ne++;
      }
      fe[f * 3 + k] = id[h];
    }
  return { eA: eA.slice(0, ne), eB: eB.slice(0, ne), fe };
}

/** Каждый треугольник на 4: (a,ab,ca) (ab,b,bc) (ca,bc,c) (ab,bc,ca); новая вершина ребра e = nv + e. */
function subdivide(faces: ArrayLike<number>, nv: number, e: Edges) {
  const F = faces.length / 3;
  const out = new Uint32Array(F * 12);
  for (let f = 0, o = 0; f < F; f++, o += 12) {
    const a = faces[f * 3], b = faces[f * 3 + 1], c = faces[f * 3 + 2];
    const ab = nv + e.fe[f * 3], bc = nv + e.fe[f * 3 + 1], ca = nv + e.fe[f * 3 + 2];
    out[o] = a; out[o + 1] = ab; out[o + 2] = ca;
    out[o + 3] = ab; out[o + 4] = b; out[o + 5] = bc;
    out[o + 6] = ca; out[o + 7] = bc; out[o + 8] = c;
    out[o + 9] = ab; out[o + 10] = bc; out[o + 11] = ca;
  }
  return out;
}

/** Новые вершины: середина родительского ребра плюс сохранённая поправка (в единицах step_mm). */
function grow(q: Int32Array, hemi: Uint8Array, from: number, e: Edges, d: ArrayLike<number>) {
  for (let k = 0; k < e.eA.length; k++) {
    const a = e.eA[k] * 3, b = e.eB[k] * 3, o = (from + k) * 3, dk = k * 3;
    q[o] = ((q[a] + q[b]) >> 1) + d[dk];
    q[o + 1] = ((q[a + 1] + q[b + 1]) >> 1) + d[dk + 1];
    q[o + 2] = ((q[a + 2] + q[b + 2]) >> 1) + d[dk + 2];
    hemi[from + k] = hemi[e.eA[k]];
  }
}

async function loadCortex(): Promise<Cortex> {
  const [meta, buf] = await Promise.all([getJson<Meta>(`${CORTEX}/meta.json`), getBuf(`${CORTEX}/fs6.bin`)]);
  const c = meta.fs6.chunks;
  const n5 = meta.counts.fs5, h5 = meta.fs5_per_hemi;
  const faces5 = view(buf, c.faces5) as Uint16Array;
  const e5 = edgeTable(faces5);
  const faces6 = subdivide(faces5, n5, e5);
  const nv = n5 + e5.eA.length;
  const q = new Int32Array(nv * 3);
  q.set(view(buf, c.q5));
  const hemi = new Uint8Array(nv);
  hemi.fill(1, h5, n5);
  grow(q, hemi, n5, e5, view(buf, c.d6));
  return {
    meta,
    n5,
    e5,
    e6: edgeTable(faces6),
    fs6: { nv, q, hemi, faces: faces6, tone: view(buf, c.tone) as Uint8Array, ao: view(buf, c.ao) as Uint8Array },
  };
}

async function loadIco7(cx: Cortex): Promise<Lod> {
  const buf = await getBuf(`${CORTEX}/${cx.meta.ico7.file}`);
  const c = cx.meta.ico7.chunks;
  const n6 = cx.fs6.nv;
  const nv = n6 + cx.e6.eA.length;
  const q = new Int32Array(nv * 3);
  q.set(cx.fs6.q);
  const hemi = new Uint8Array(nv);
  hemi.set(cx.fs6.hemi);
  grow(q, hemi, n6, cx.e6, view(buf, c.d7));
  return { nv, q, hemi, faces: subdivide(cx.fs6.faces, n6, cx.e6), tone: view(buf, c.tone) as Uint8Array, ao: view(buf, c.ao) as Uint8Array };
}

const getBin = async (id: string): Promise<Uint8Array> => {
  const r = await fetch(`${BASE}/${id}.bin`);
  if (!r.ok) throw new Error(String(r.status));
  return new Uint8Array(await r.arrayBuffer());
};

// общее состояние между React и циклом отрисовки (без перерисовки React на каждом кадре)
type Live = {
  frames: Uint8Array | null;
  ex: Ex | null;
  t: number;
  playing: boolean;
  scrubbing: boolean;
  dirty: boolean;
  morphFrom: Float32Array | null;
  morphStart: number;
};

export function BrainPlayer({
  lang,
  text,
  variant = "section",
  children,
}: {
  lang: Lang;
  text: BrainPlayerText;
  variant?: "section" | "compact";
  children?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const labelRefs = useRef<Record<ZoneKey, HTMLSpanElement | null>>({ language: null, auditory: null });
  const meterRefs = useRef<Record<ZoneKey, HTMLSpanElement | null>>({ language: null, auditory: null });
  const levelRefs = useRef<Record<ZoneKey, HTMLSpanElement | null>>({ language: null, auditory: null });
  const cache = useRef(new Map<string, Uint8Array>());
  const live = useRef<Live>({ frames: null, ex: null, t: 0, playing: true, scrubbing: false, dirty: true, morphFrom: null, morphStart: -1 });
  const kickRef = useRef<() => void>(() => {});
  const snapshotRef = useRef<(() => void) | null>(null);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const [mode, setMode] = useState<"idle" | "loading" | "live" | "static">("idle");
  const [index, setIndex] = useState<Index | null>(null);
  const [mesh, setMesh] = useState<Cortex | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [frames, setFrames] = useState(30);

  const exercises = index?.exercises ?? [];
  const current = exercises[active];
  const title = (e: Ex) => (lang === "en" ? e.title_en : e.title_ru);

  // ленивый старт у экрана
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    const start = async () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !webglOk()) {
        setMode("static");
        return;
      }
      setMode("loading");
      try {
        const [ix, m] = await Promise.all([
          fetch(`${BASE}/index.json`).then((r) => (r.ok ? (r.json() as Promise<Index>) : Promise.reject(r.status))),
          loadCortex(),
        ]);
        const first = ix.exercises[0];
        const bin = await getBin(first.id);
        if (cancelled) return;
        cache.current.set(first.id, bin);
        setIndex(ix);
        setMesh(m);
      } catch {
        if (!cancelled) setMode("static");
      }
    };
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "500px 0px" },
    );
    io.observe(box);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  // сцена
  useEffect(() => {
    if (!mesh || !index || !hostRef.current) return;
    const host = hostRef.current;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;

      const n5 = mesh.n5;
      const n6 = mesh.fs6.nv;
      const step = mesh.meta.step_mm, ctr = mesh.meta.center;

      // разводим полушария и нормируем размер по fs6; то же преобразование потом для ico7, чтобы подмена была незаметной
      const q6 = mesh.fs6.q, hemi6 = mesh.fs6.hemi;
      let lMax = -Infinity, rMin = Infinity, lMin = Infinity, rMax = -Infinity;
      for (let i = 0; i < n6; i++) {
        const x = q6[i * 3] * step + ctr[0];
        if (!hemi6[i]) { lMax = Math.max(lMax, x); lMin = Math.min(lMin, x); }
        else { rMin = Math.min(rMin, x); rMax = Math.max(rMax, x); }
      }
      const width = Math.max(rMax, lMax) - Math.min(lMin, rMin);
      const gap = Math.max(0, lMax - rMin + width * 0.04) / 2;
      const decode = (lod: Lod) => {
        const p = new Float32Array(lod.nv * 3);
        for (let i = 0; i < lod.nv; i++) {
          p[i * 3] = lod.q[i * 3] * step + ctr[0] + (lod.hemi[i] ? gap : -gap);
          p[i * 3 + 1] = lod.q[i * 3 + 1] * step + ctr[1];
          p[i * 3 + 2] = lod.q[i * 3 + 2] * step + ctr[2];
        }
        return p;
      };
      let fit: { c: number[]; s: number } | null = null;
      const makeGeo = (lod: Lod, idx: Float32Array) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(decode(lod), 3));
        g.setIndex(new THREE.BufferAttribute(lod.faces, 1));
        g.setAttribute("aTone", new THREE.BufferAttribute(lod.tone, 1, true));
        g.setAttribute("aAo", new THREE.BufferAttribute(lod.ao, 1, true));
        g.setAttribute("aIdx", new THREE.BufferAttribute(idx, 2));
        if (!fit) {
          g.computeBoundingSphere();
          const bs = g.boundingSphere!;
          fit = { c: [bs.center.x, bs.center.y, bs.center.z], s: 1 / bs.radius };
        }
        g.translate(-fit.c[0], -fit.c[1], -fit.c[2]);
        g.scale(fit.s, fit.s, fit.s);
        g.computeVertexNormals(); // по площади граней: ровный свет на извилинах
        g.computeBoundingSphere();
        return g;
      };
      // aIdx: какие две вершины fs6 усреднить (у вершин fs6 это она сама)
      const idx6 = new Float32Array(n6 * 2);
      for (let v = 0; v < n6; v++) idx6[v * 2] = idx6[v * 2 + 1] = v;
      const geo = makeGeo(mesh.fs6, idx6);

      // значения fs6 для шейдера
      const texH = Math.ceil(n6 / TEX_W);
      const texData = new Float32Array(TEX_W * texH).fill(128);
      const valTex = new THREE.DataTexture(texData, TEX_W, texH, THREE.RedFormat, THREE.FloatType);
      valTex.minFilter = valTex.magFilter = THREE.NearestFilter;
      valTex.needsUpdate = true;

      const e5 = mesh.e5, e6 = mesh.e6;
      const deg5 = new Float32Array(n5), deg6 = new Float32Array(n6);
      for (let e = 0; e < e5.eA.length; e++) { deg5[e5.eA[e]]++; deg5[e5.eB[e]]++; }
      for (let e = 0; e < e6.eA.length; e++) { deg6[e6.eA[e]]++; deg6[e6.eB[e]]++; }
      const raw5 = new Float32Array(n5), sum5 = new Float32Array(n5), val5 = new Float32Array(n5);
      const val6 = new Float32Array(n6), sum6 = new Float32Array(n6);

      const v3 = (c: number[]) => new THREE.Vector3(c[0], c[1], c[2]);
      const uniforms = {
        uVal: { value: valTex },
        uGain: { value: GAIN },
        uStops: { value: v3(STOPS) },
        uC0: { value: v3(RAMP[0]) },
        uC1: { value: v3(RAMP[1]) },
        uC2: { value: v3(RAMP[2]) },
        uC3: { value: v3(RAMP[3]) },
        uSulcus: { value: v3(SULCUS) },
        uGyrus: { value: v3(GYRUS) },
      };
      // тонкий блеск на гребнях извилин без пластика
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = sh.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
            attribute vec2 aIdx;
            attribute float aTone;
            attribute float aAo;
            uniform highp sampler2D uVal;
            varying float vVal;
            varying float vTone;
            varying float vAo;
            float bpVal(float i) { int k = int(i + 0.5); return texelFetch(uVal, ivec2(k & ${TEX_W - 1}, k >> ${Math.log2(TEX_W)}), 0).r; }`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            vVal = 0.5 * (bpVal(aIdx.x) + bpVal(aIdx.y));
            vTone = aTone;
            vAo = aAo;`,
          );
        sh.fragmentShader = sh.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
            uniform float uGain;
            uniform vec3 uStops, uC0, uC1, uC2, uC3, uSulcus, uGyrus;
            varying float vVal;
            varying float vTone;
            varying float vAo;`,
          )
          .replace(
            "#include <color_fragment>",
            `float bpT = clamp((vVal / 255.0 - 0.5) * 2.0 * uGain, 0.0, 1.0);
            vec3 bpRamp = bpT < uStops.x ? mix(uC0, uC1, bpT / uStops.x)
              : bpT < uStops.y ? mix(uC1, uC2, (bpT - uStops.x) / (uStops.y - uStops.x))
              : mix(uC2, uC3, (bpT - uStops.y) / (uStops.z - uStops.y));
            float bpA = 0.9 * smoothstep(0.07, 0.36, bpT);
            vec3 bpBase = mix(uSulcus, uGyrus, smoothstep(0.0, 1.0, vTone));
            diffuseColor.rgb = mix(bpBase * vAo, bpRamp * mix(1.0, vAo, 0.5), bpA); // активность во впадинах темнеет вдвое слабее, цвет остаётся чистым`,
          )
          // мягкий контровой свет по краю силуэта (френель), чтобы кора отделялась от фона
          .replace(
            "#include <opaque_fragment>",
            `float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            outgoingLight += vec3(0.80, 0.90, 0.92) * pow(rimF, 3.0) * 0.3;
            #include <opaque_fragment>`,
          );
      };
      const brain = new THREE.Mesh(geo, mat);
      brain.rotation.x = -Math.PI / 2; // fsaverage Z-вверх -> Y-вверх
      const group = new THREE.Group();
      group.add(brain);

      const scene = new THREE.Scene();
      scene.add(group);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xaab8bf, 1.05));
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      camera.position.set(-3.9, 0.95, -0.35);
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(0.5, 1, 1);
      camera.add(key);
      const fill = new THREE.DirectionalLight(0xe8f1f2, 0.4);
      fill.position.set(-1, -0.4, 0.6);
      camera.add(fill);
      scene.add(camera);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.touchAction = "pan-y"; // вертикальный свайп листает страницу
      host.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, -0.14, 0); // мозг чуть выше центра: внизу панель воспроизведения
      controls.minPolarAngle = Math.PI * 0.28;
      controls.maxPolarAngle = Math.PI * 0.72;
      let interacted = 0;
      controls.addEventListener("start", () => (interacted = performance.now()));

      const resize = () => {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // узкий экран: камера чуть дальше, чтобы мозг не обрезался
        const fit = Math.max(1, 1.05 / camera.aspect);
        camera.position.setLength((variant === "compact" ? 4.25 : 4.6) * Math.min(fit, 1.35));
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      // якоря подписей зон
      const P = geo.getAttribute("position").array as Float32Array;
      const Nn = geo.getAttribute("normal").array as Float32Array;
      const anchors = ZONES.map((z) => {
        // якорь из сетки (лобная часть языковой сети, видимая часть слуховой коры), иначе из index.json; номера fs5 общие для всех уровней
        const fromMesh = mesh.meta.anchors?.[z];
        const from5 = index.anchors?.[z];
        const i = typeof fromMesh === "number" ? fromMesh : typeof from5 === "number" ? from5 : -1;
        if (i < 0 || i >= n5) return null;
        return {
          z,
          p: new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]),
          nrm: new THREE.Vector3(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]),
        };
      });
      const wp = new THREE.Vector3(), wn = new THREE.Vector3(), toCam = new THREE.Vector3();
      const nMat = new THREE.Matrix3();

      const L = live.current;
      // снимок показанных значений для перетекания при смене упражнения
      snapshotRef.current = () => {
        if (L.frames) L.morphFrom = texData.slice(0, n6);
      };
      let lastColor = 0;
      let lastNow = performance.now();

      const paint = (now: number) => {
        const fr = L.frames, ex = L.ex;
        if (!fr || !ex) return;
        const text = textRef.current;
        const nf = ex.frames;
        const t = Math.min(Math.max(L.t, 0), nf - 1);
        const i0 = Math.floor(t), i1 = Math.min(nf - 1, i0 + 1), f = t - i0;
        const b0 = i0 * n5, b1 = i1 * n5;
        let m = 1, from: Float32Array | null = null;
        if (L.morphFrom && L.morphStart >= 0) {
          const k = Math.min(1, (now - L.morphStart) / MORPH_MS);
          m = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease-in-out для перетекания на месте
          from = L.morphFrom;
          if (k >= 1) { L.morphFrom = null; L.morphStart = -1; from = null; m = 1; }
        }
        // кадр fs5 -> два прохода сглаживания -> fs6 (середина ребра) -> ещё проход на fs6 -> текстура
        for (let v = 0; v < n5; v++) raw5[v] = fr[b0 + v] * (1 - f) + fr[b1 + v] * f;
        for (let pass = 0; pass < 2; pass++) {
          const src = pass ? val5 : raw5;
          sum5.fill(0);
          for (let e = 0; e < e5.eA.length; e++) {
            const x = e5.eA[e], y = e5.eB[e];
            sum5[x] += src[y];
            sum5[y] += src[x];
          }
          // второй проход пишет поверх val5: сумма соседей уже собрана, порядок не важен
          for (let v = 0; v < n5; v++) val5[v] = src[v] * (1 - SMOOTH) + (sum5[v] / deg5[v]) * SMOOTH;
        }
        val6.set(val5);
        for (let k = 0; k < e5.eA.length; k++) val6[n5 + k] = (val5[e5.eA[k]] + val5[e5.eB[k]]) * 0.5;
        sum6.fill(0);
        for (let e = 0; e < e6.eA.length; e++) {
          const x = e6.eA[e], y = e6.eB[e];
          sum6[x] += val6[y];
          sum6[y] += val6[x];
        }
        for (let v = 0; v < n6; v++) {
          const val = val6[v] * (1 - SMOOTH) + (sum6[v] / deg6[v]) * SMOOTH;
          texData[v] = from ? from[v] + (val - from[v]) * m : val;
        }
        valTex.needsUpdate = true;

        // полоски зон и подписи уровня
        for (const z of ZONES) {
          const curve = ex.zones?.[z];
          if (!curve?.length) continue;
          const zv = (curve[i0] ?? 0) * (1 - f) + (curve[i1] ?? 0) * f;
          const meter = meterRefs.current[z];
          if (meter) meter.style.transform = `scaleX(${Math.min(1, Math.max(0.02, (zv + 1.5) / 3)).toFixed(3)})`;
          const lvl = levelRefs.current[z];
          const word = zv > 0.25 ? text.levels[2] : zv < -0.25 ? text.levels[0] : text.levels[1];
          if (lvl && lvl.textContent !== word) lvl.textContent = word;
          const lab = labelRefs.current[z];
          if (lab) lab.style.setProperty("--lvl", Math.min(1, Math.max(0, (zv + 0.5) / 1.5)).toFixed(2));
        }
        // бегунок и время
        const sl = sliderRef.current;
        if (sl && !L.scrubbing) sl.value = String(t);
        if (sl) sl.style.setProperty("--p", `${((t / Math.max(1, nf - 1)) * 100).toFixed(2)}%`);
        const tl = timeRef.current;
        if (tl) {
          const txt = `${Math.floor(t + ex.start_s)} ${text.sec}`;
          if (tl.textContent !== txt) tl.textContent = txt;
        }
        if (sl) sl.setAttribute("aria-valuetext", `${Math.floor(t + ex.start_s)} ${text.sec} ${text.of} ${nf - 1 + ex.start_s}`);
      };

      let visible = true;
      let raf = 0;
      const loop = (now: number) => {
        raf = 0;
        const dt = Math.min(0.1, (now - lastNow) / 1000);
        lastNow = now;
        const ex = L.ex;
        if (ex && L.playing && !L.scrubbing && L.frames) {
          L.t += dt * (ex.fps || 1);
          if (L.t > ex.frames - 1) L.t = 0; // по кругу
          L.dirty = true;
        }
        if ((L.dirty || L.morphFrom) && now - lastColor >= COLOR_STEP_MS) {
          paint(now);
          lastColor = now;
          L.dirty = false;
        }
        // лёгкое покачивание, пока идёт проигрывание и никто не крутил мозг
        if (L.playing && now - interacted > 4000) group.rotation.y += (Math.sin(now / 3200) * 0.28 - group.rotation.y) * 0.04;
        controls.update();
        renderer.render(scene, camera);

        // подписи зон: проекция якоря на экран, прячем на обратной стороне
        const w = host.clientWidth, h = host.clientHeight;
        brain.updateMatrixWorld();
        nMat.getNormalMatrix(brain.matrixWorld);
        for (const a of anchors) {
          if (!a) continue;
          const el = labelRefs.current[a.z];
          if (!el) continue;
          wp.copy(a.p).applyMatrix4(brain.matrixWorld);
          wn.copy(a.nrm).applyMatrix3(nMat).normalize();
          toCam.copy(camera.position).sub(wp).normalize();
          const facing = wn.dot(toCam);
          wp.project(camera);
          const x = (wp.x * 0.5 + 0.5) * w, y = (-wp.y * 0.5 + 0.5) * h;
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          el.style.opacity = String(Math.min(1, Math.max(0, (facing - 0.05) * 4)).toFixed(2));
        }
        if (visible && !document.hidden) raf = requestAnimationFrame(loop);
      };
      const kick = () => {
        if (!raf && visible && !document.hidden) {
          lastNow = performance.now();
          raf = requestAnimationFrame(loop);
        }
      };
      kickRef.current = kick;
      const vio = new IntersectionObserver((es) => {
        visible = es.some((e) => e.isIntersecting);
        kick();
      });
      vio.observe(host);
      document.addEventListener("visibilitychange", kick);

      setMode("live");
      kick();
      performance.mark("brain:fs6-live");

      // десктоп: в простое догружаем ico7 и подменяем геометрию (те же номера fs5/fs6, то же преобразование)
      let idleId = 0;
      const upgrade = async () => {
        try {
          const lod = await loadIco7(mesh);
          if (disposed) return;
          const idx = new Float32Array(lod.nv * 2);
          idx.set(idx6);
          for (let k = 0; k < e6.eA.length; k++) {
            idx[(n6 + k) * 2] = e6.eA[k];
            idx[(n6 + k) * 2 + 1] = e6.eB[k];
          }
          const g7 = makeGeo(lod, idx);
          const old = brain.geometry;
          brain.geometry = g7;
          old.dispose();
          L.dirty = true;
          kick();
          performance.mark("brain:ico7-live");
        } catch {
          // остаёмся на fs6
        }
      };
      if (wantIco7()) {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        idleId = ric ? ric(() => void upgrade(), { timeout: 1500 }) : window.setTimeout(() => void upgrade(), 400);
      }

      cleanup = () => {
        const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (idleId && cic) cic(idleId);
        else if (idleId) window.clearTimeout(idleId);
        if (raf) cancelAnimationFrame(raf);
        vio.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", kick);
        controls.dispose();
        brain.geometry.dispose();
        mat.dispose();
        valTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        kickRef.current = () => {};
        snapshotRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [mesh, index, variant]);

  // выбранное упражнение: кадры из кэша или с сервера, перетекание из текущих цветов
  useEffect(() => {
    if (mode !== "live" || !current) return;
    let cancelled = false;
    const apply = (bin: Uint8Array) => {
      if (cancelled) return;
      const L = live.current;
      L.ex = current;
      L.frames = bin;
      L.t = 0;
      L.dirty = true;
      L.morphStart = L.morphFrom ? performance.now() : -1;
      setFrames(current.frames);
      kickRef.current();
    };
    const hit = cache.current.get(current.id);
    if (hit) apply(hit);
    else getBin(current.id).then((b) => {
      cache.current.set(current.id, b);
      apply(b);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, current]);

  // остальные упражнения подгружаем в фоне, когда первое уже играет
  useEffect(() => {
    if (mode !== "live" || !index) return;
    const id = window.setTimeout(() => {
      for (const e of index.exercises) if (!cache.current.has(e.id)) getBin(e.id).then((b) => cache.current.set(e.id, b)).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(id);
  }, [mode, index]);

  useEffect(() => {
    live.current.playing = playing;
    kickRef.current();
  }, [playing]);

  const choose = (i: number) => {
    if (i === active) return;
    snapshotRef.current?.();
    setActive(i);
  };

  const seek = (v: number) => {
    const L = live.current;
    L.t = v;
    L.dirty = true;
    // бегунок и подпись для экранного диктора обновляем сразу, не дожидаясь кадра
    const sl = sliderRef.current;
    if (sl && L.ex) {
      sl.value = String(v);
      sl.setAttribute("aria-valuetext", `${Math.floor(v + L.ex.start_s)} ${text.sec} ${text.of} ${L.ex.frames - 1 + L.ex.start_s}`);
    }
    kickRef.current();
  };

  const isLive = mode === "live";

  return (
    <div className={`s-bp s-bp--${variant}${mode === "static" ? " is-static" : ""}`} ref={boxRef}>
      {children ? <div className="s-bp__head">{children}</div> : null}

      <div className="s-bp__stage">
        {mode === "static" ? (
          <img className="s-bp__static" src={`/site/brain-static-${lang}.webp`} alt={text.alt} loading="lazy" decoding="async" />
        ) : (
          <div className="s-bp__canvas" ref={hostRef} role="img" aria-label={current ? `${text.alt}: ${title(current)}` : text.alt} />
        )}

        {isLive &&
          ZONES.map((z) => (
            <span
              key={z}
              className={`s-bp__label is-${z}`}
              ref={(el) => {
                labelRefs.current[z] = el;
              }}
              aria-hidden="true"
            >
              <i />
              <b>{text.zones[z]}</b>
            </span>
          ))}

        {(mode === "idle" || mode === "loading") && <p className="s-bp__loading">{text.loading}</p>}

        {isLive && (
          <div className="s-bp__bar">
            <button type="button" className="s-bp__play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? text.pause : text.play}>
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <input
              ref={sliderRef}
              className="s-bp__range"
              type="range"
              min={0}
              max={Math.max(1, frames - 1)}
              step={0.05}
              defaultValue={0}
              aria-label={text.time}
              onPointerDown={() => (live.current.scrubbing = true)}
              onPointerUp={() => (live.current.scrubbing = false)}
              onPointerCancel={() => (live.current.scrubbing = false)}
              onBlur={() => (live.current.scrubbing = false)}
              onInput={(e) => seek(Number((e.target as HTMLInputElement).value))}
              onKeyDown={(e) => {
                const L = live.current;
                const max = Math.max(1, frames - 1);
                let v: number | null = null;
                if (e.key === "ArrowRight" || e.key === "ArrowUp") v = Math.min(max, Math.floor(L.t) + 1);
                if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = Math.max(0, Math.ceil(L.t) - 1);
                if (e.key === "Home") v = 0;
                if (e.key === "End") v = max;
                if (v !== null) {
                  e.preventDefault();
                  seek(v);
                }
              }}
            />
            <span className="s-bp__time" ref={timeRef} aria-hidden="true">
              {current ? `${current.start_s} ${text.sec}` : ""}
            </span>
          </div>
        )}
        {isLive && variant === "section" && <span className="s-bp__hint">{text.drag}</span>}
      </div>

      <div className="s-bp__ctrl">
        {isLive && exercises.length > 1 && (
          <div className="s-bp__switch" role="radiogroup" aria-label={text.group}>
            {exercises.map((e, i) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={i === active}
                tabIndex={i === active ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={(ev) => {
                  const k = ev.key;
                  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(k)) return;
                  ev.preventDefault();
                  const next = k === "ArrowRight" || k === "ArrowDown" ? (i + 1) % exercises.length : (i - 1 + exercises.length) % exercises.length;
                  choose(next);
                  (ev.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                }}
              >
                {title(e)}
              </button>
            ))}
          </div>
        )}

        {isLive && variant === "section" && (
          <ul className="s-bp__zones">
            {ZONES.map((z) => (
              <li key={z}>
                <span className={`s-bp__dot is-${z}`} aria-hidden="true" />
                <span className="s-bp__zname">{text.zones[z]}</span>
                <span
                  className="s-bp__level"
                  ref={(el) => {
                    levelRefs.current[z] = el;
                  }}
                >
                  {text.levels[1]}
                </span>
                <span className="s-bp__meter" aria-hidden="true">
                  <span
                    ref={(el) => {
                      meterRefs.current[z] = el;
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}

        {isLive && (
          <div className="s-bp__legend" aria-hidden="true">
            <span>{text.low}</span>
            <i />
            <span>{text.high}</span>
          </div>
        )}
        <p className="s-bp__caption">{text.caption}</p>
      </div>
    </div>
  );
}

export default BrainPlayer;
