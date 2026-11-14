"use client";

/* eslint-disable @next/next/no-img-element */
/*
 * Проигрыватель предсказанной активности коры по секундам (TRIBE v2).
 * Данные: /brain/mesh.json {positions, indices, hemi_split}
 *         /brain/timeseries/index.json {anchors, exercises: [{id, title_ru, title_en, frames, fps, start_s, zones}]}
 *         /brain/timeseries/<id>.bin  uint8, кадр за кадром по 20484 вершины, (z + 2) / 4 * 255, 128 = средний отклик
 * Three.js и данные грузятся только при приближении к блоку.
 * Без WebGL, при prefers-reduced-motion или ошибке загрузки: статичная картинка.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "./i18n";

type Mesh = { positions: number[]; indices: number[]; hemi_split?: number };
type Zones = { language: number[]; auditory: number[]; visual?: number[] };
type Ex = { id: string; title_ru: string; title_en: string; frames: number; fps: number; start_s: number; zones: Zones };
type Index = { vertices: number; anchors: Record<string, number>; exercises: Ex[] };
type ZoneKey = "language" | "auditory";
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
const MORPH_MS = 600;
const COLOR_STEP_MS = 33; // цвета пересчитываем не чаще 30 раз в секунду
const GAIN = 1.7; // контраст показа: полная шкала цвета при |z| около 1.2, обрезка как у данных

// Палитра Siriva: ниже среднего светлее, средний серый, выше: синий, потом зелёный
const PAPER = [0xf1 / 255, 0xf4 / 255, 0xf6 / 255];
const GREY = [0xd3 / 255, 0xdb / 255, 0xe1 / 255];
const BLUE = [0x2f / 255, 0x5d / 255, 0x7c / 255];
const GREEN = [0x1c / 255, 0x5a / 255, 0x51 / 255];

function buildLut(): Float32Array {
  const lut = new Float32Array(256 * 3);
  const c = [0, 0, 0];
  const mix = (a: number[], b: number[], t: number) => {
    for (let k = 0; k < 3; k++) c[k] = a[k] + (b[k] - a[k]) * t;
  };
  for (let i = 0; i < 256; i++) {
    const v = Math.min(1, Math.max(0, 0.5 + (i / 255 - 0.5) * GAIN));
    if (v < 0.5) mix(PAPER, GREY, v / 0.5);
    else {
      const t = (v - 0.5) / 0.5;
      if (t < 0.55) mix(GREY, BLUE, t / 0.55);
      else mix(BLUE, GREEN, (t - 0.55) / 0.45);
    }
    // вершинные цвета three.js линейные
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = Math.pow(c[k], 2.2);
  }
  return lut;
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
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
  const [mesh, setMesh] = useState<Mesh | null>(null);
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
          fetch("/brain/mesh.json").then((r) => (r.ok ? (r.json() as Promise<Mesh>) : Promise.reject(r.status))),
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

      const { positions, indices, hemi_split } = mesh;
      const n = positions.length / 3;
      const pos = new Float32Array(positions);
      const split = hemi_split && hemi_split > 0 && hemi_split < n ? hemi_split : 0;
      if (split) {
        let lMax = -Infinity, rMin = Infinity, lMin = Infinity, rMax = -Infinity;
        for (let i = 0; i < n; i++) {
          const x = pos[i * 3];
          if (i < split) { lMax = Math.max(lMax, x); lMin = Math.min(lMin, x); }
          else { rMin = Math.min(rMin, x); rMax = Math.max(rMax, x); }
        }
        const width = Math.max(rMax, lMax) - Math.min(lMin, rMin);
        const overlap = lMax - rMin + width * 0.04;
        if (overlap > 0) for (let i = 0; i < n; i++) pos[i * 3] += i < split ? -overlap / 2 : overlap / 2;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const bs = geo.boundingSphere!;
      geo.translate(-bs.center.x, -bs.center.y, -bs.center.z);
      const s = 1 / bs.radius;
      geo.scale(s, s, s);

      const colors = new Float32Array(n * 3);
      const colorAttr = new THREE.BufferAttribute(colors, 3);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("color", colorAttr);
      const lut = buildLut();
      for (let i = 0; i < n; i++) colors.set(lut.subarray(128 * 3, 128 * 3 + 3), i * 3);

      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const brain = new THREE.Mesh(geo, mat);
      brain.rotation.x = -Math.PI / 2; // fsaverage Z-вверх -> Y-вверх
      const group = new THREE.Group();
      group.add(brain);

      const scene = new THREE.Scene();
      scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      camera.position.set(-3.9, 0.95, -0.35);
      const key = new THREE.DirectionalLight(0xffffff, 1.45);
      key.position.set(0.4, 1, 1);
      camera.add(key);
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
        camera.position.setLength((variant === "compact" ? 3.7 : 4.6) * Math.min(fit, 1.35));
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      // якоря подписей зон
      const P = geo.getAttribute("position").array as Float32Array;
      const Nn = geo.getAttribute("normal").array as Float32Array;
      const anchors = ZONES.map((z) => {
        const i = index.anchors?.[z];
        if (typeof i !== "number" || i < 0 || i >= n) return null;
        return {
          z,
          p: new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]),
          nrm: new THREE.Vector3(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]),
        };
      });
      const wp = new THREE.Vector3(), wn = new THREE.Vector3(), toCam = new THREE.Vector3();
      const nMat = new THREE.Matrix3();

      const L = live.current;
      // снимок текущих цветов для перетекания при смене упражнения
      snapshotRef.current = () => {
        if (L.frames) L.morphFrom = colors.slice();
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
        const b0 = i0 * n, b1 = i1 * n;
        let m = 1, from: Float32Array | null = null;
        if (L.morphFrom && L.morphStart >= 0) {
          const k = Math.min(1, (now - L.morphStart) / MORPH_MS);
          m = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease-in-out для перетекания на месте
          from = L.morphFrom;
          if (k >= 1) { L.morphFrom = null; L.morphStart = -1; from = null; m = 1; }
        }
        for (let v = 0; v < n; v++) {
          const val = (fr[b0 + v] * (1 - f) + fr[b1 + v] * f) | 0;
          const li = val * 3, ci = v * 3;
          if (from) {
            colors[ci] = from[ci] + (lut[li] - from[ci]) * m;
            colors[ci + 1] = from[ci + 1] + (lut[li + 1] - from[ci + 1]) * m;
            colors[ci + 2] = from[ci + 2] + (lut[li + 2] - from[ci + 2]) * m;
          } else {
            colors[ci] = lut[li];
            colors[ci + 1] = lut[li + 1];
            colors[ci + 2] = lut[li + 2];
          }
        }
        colorAttr.needsUpdate = true;

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

      cleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        vio.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", kick);
        controls.dispose();
        geo.dispose();
        mat.dispose();
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
