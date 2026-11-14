"use client";

/* eslint-disable @next/next/no-img-element */
/*
 * Интерактивный мозг на выходных данных TRIBE v2.
 * Three.js грузится лениво: только когда секция подходит к экрану.
 * Данные: /brain/mesh.json {positions, indices, hemi_split}
 *         /brain/loads.json {meta, exercises: {id: {title_ru, title_en, group, values}}, diff_speech_minus_visual}
 * Без WebGL или при prefers-reduced-motion: статичная картинка /site/brain-static-{ru,en}.webp (из es/tribe/viz).
 * Для проверки без данных: ?brain=demo (синтетическая сфера, на сайте не показывается).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "./i18n";

type Mesh = { positions: number[]; indices: number[]; hemi_split?: number };
type Exercise = { title_ru?: string; title_en?: string; group?: string; values: number[] };
type Loads = {
  meta?: { model?: string; caveat_ru?: string; caveat_en?: string };
  exercises: Record<string, Exercise>;
  diff_speech_minus_visual?: number[] | { values: number[] };
};
type Option = { id: string; label: string; values: number[]; diverging: boolean };

export type BrainText = {
  group: string;
  caption: string;
  agreement: string;
  diff: string;
  low: string;
  high: string;
  diffLow: string;
  diffHigh: string;
  loading: string;
  alt: string;
  unavailable: string;
};

// цвета палитры Siriva
const GREY: [number, number, number] = [0.86, 0.89, 0.91]; // #DCE3E8
const BLUE: [number, number, number] = [0x2f / 255, 0x5d / 255, 0x7c / 255];
const GREEN: [number, number, number] = [0x1c / 255, 0x5a / 255, 0x51 / 255];

function mix(a: number[], b: number[], t: number, out: number[]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

// нагрузка: серый -> синий -> зелёный; разность: синий (зрение) <- серый -> зелёный (речь)
function colorize(values: number[], diverging: boolean, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const v = Math.min(255, Math.max(0, values[i] ?? 0)) / 255;
    if (diverging) {
      if (v < 0.5) mix(BLUE, GREY, v / 0.5, c);
      else mix(GREY, GREEN, (v - 0.5) / 0.5, c);
    } else {
      // 128 = средний отклик; ниже среднего остаётся серым
      const t = Math.max(0, (v - 0.5) / 0.5);
      if (t < 0.6) mix(GREY, BLUE, t / 0.6, c);
      else mix(BLUE, GREEN, (t - 0.6) / 0.4, c);
    }
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  return out;
}

// cubic-bezier(0.77, 0, 0.175, 1): сильный ease-in-out для перетекания на месте
function bezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
const easeInOut = bezier(0.77, 0, 0.175, 1);
const MORPH_MS = 800;

function synthetic(): { mesh: Mesh; loads: Loads } {
  // две сферы как полушария, только для локальной проверки
  const positions: number[] = [];
  const indices: number[] = [];
  const W = 64, H = 48;
  let split = 0;
  for (let h = 0; h < 2; h++) {
    const base = positions.length / 3;
    for (let y = 0; y <= H; y++) {
      const v = y / H, th = v * Math.PI;
      for (let x = 0; x <= W; x++) {
        const u = x / W, ph = u * Math.PI * 2;
        positions.push((h ? 1 : -1) * 0.55 + 0.5 * Math.sin(th) * Math.cos(ph), 0.7 * Math.cos(th), 0.9 * Math.sin(th) * Math.sin(ph));
      }
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const a = base + y * (W + 1) + x, b = a + W + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    if (h === 0) split = positions.length / 3;
  }
  const n = positions.length / 3;
  const field = (f: (x: number, y: number, z: number) => number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(Math.round(255 * Math.max(0, Math.min(1, f(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])))));
    return out;
  };
  return {
    mesh: { positions, indices, hemi_split: split },
    loads: {
      meta: { model: "synthetic", caveat_ru: "Синтетическая сфера для проверки", caveat_en: "Synthetic sphere for testing" },
      exercises: {
        retell: { title_ru: "Пересказ рассказа", title_en: "Story retelling", group: "speech", values: field((x, y) => 0.5 + 0.5 * Math.sin(3 * x + 2 * y)) },
        picture: { title_ru: "Описание картинки", title_en: "Picture description", group: "speech", values: field((x, y, z) => 0.5 + 0.5 * Math.cos(4 * z - y)) },
        sequence: { title_ru: "Последовательность на поле", title_en: "Sequence on a grid", group: "visual", values: field((x, y, z) => 0.5 - 0.5 * Math.sin(2 * z + 3 * y)) },
      },
      diff_speech_minus_visual: field((x, y) => 0.5 + 0.4 * Math.sin(5 * x * y)),
    },
  };
}

function pickOptions(loads: Loads, lang: Lang, diffLabel: string): Option[] {
  const entries = Object.entries(loads.exercises ?? {}).filter(([k, e]) => k !== "diff_speech_minus_visual" && Array.isArray(e?.values));
  const wanted = [/пересказ|retell/i, /картинк|picture/i, /последовател|sequence/i];
  const chosen: [string, Exercise][] = [];
  for (const re of wanted) {
    const hit = entries.find(([id, e]) => !chosen.some(([c]) => c === id) && (re.test(e.title_ru ?? "") || re.test(e.title_en ?? "") || re.test(id)));
    if (hit) chosen.push(hit);
  }
  for (const e of entries) if (chosen.length < 3 && !chosen.some(([c]) => c === e[0])) chosen.push(e);
  const opts: Option[] = chosen.map(([id, e]) => ({
    id,
    label: (lang === "en" ? e.title_en : e.title_ru) || e.title_ru || e.title_en || id,
    values: e.values,
    diverging: false,
  }));
  const rawDiff = loads.diff_speech_minus_visual ?? (loads.exercises as Record<string, unknown>)?.diff_speech_minus_visual;
  const diffValues = Array.isArray(rawDiff) ? rawDiff : (rawDiff as { values?: number[] } | undefined)?.values;
  if (Array.isArray(diffValues)) opts.push({ id: "diff", label: diffLabel, values: diffValues, diverging: true });
  return opts;
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function BrainViewer({ lang, text }: { lang: Lang; text: BrainText }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"idle" | "loading" | "live" | "static" | "none">("idle");
  const [data, setData] = useState<{ mesh: Mesh; loads: Loads } | null>(null);
  const [active, setActive] = useState(0);
  const setColorsRef = useRef<((opt: Option) => void) | null>(null);

  const options = useMemo(() => (data ? pickOptions(data.loads, lang, text.diff) : []), [data, lang, text.diff]);
  const current = options[active] ?? options[0];
  const caveat = data?.loads.meta ? (lang === "en" ? data.loads.meta.caveat_en : data.loads.meta.caveat_ru) : undefined;

  // ленивый старт: секция у экрана
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    const start = async () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || !webglOk()) {
        setMode("static");
        return;
      }
      setMode("loading");
      const demo = new URLSearchParams(window.location.search).get("brain") === "demo";
      try {
        if (demo) throw new Error("demo");
        const [m, l] = await Promise.all([
          fetch("/brain/mesh.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
          fetch("/brain/loads.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        ]);
        if (!cancelled) setData({ mesh: m, loads: l });
      } catch {
        if (cancelled) return;
        if (demo) setData(synthetic());
        else setMode("static");
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(box);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  // сцена Three.js
  useEffect(() => {
    if (!data || !canvasHostRef.current) return;
    const host = canvasHostRef.current;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;

      const { positions, indices, hemi_split } = data.mesh;
      const n = positions.length / 3;
      const pos = new Float32Array(positions);

      // разводим полушария, чтобы раздутая кора не пересекалась
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
      const scale = 1 / bs.radius;
      geo.scale(scale, scale, scale);

      const colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
      geo.setAttribute("color", colorAttr);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      // fsaverage: X вправо, Y вперёд, Z вверх -> поворачиваем в Y-вверх
      mesh.rotation.x = -Math.PI / 2;
      const group = new THREE.Group();
      group.add(mesh);

      const scene = new THREE.Scene();
      scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(-3.1, 0.9, -1.3);
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(0.5, 1, 1);
      camera.add(key);
      scene.add(camera);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      host.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.8;
      controls.minPolarAngle = Math.PI * 0.25;
      controls.maxPolarAngle = Math.PI * 0.75;
      // вертикальный свайп листает страницу, горизонтальный крутит мозг
      renderer.domElement.style.touchAction = "pan-y";

      const resize = () => {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      // перетекание цветов
      const from = new Float32Array(n * 3);
      let to: Float32Array = new Float32Array(n * 3);
      let morphStart = -1;
      let first = true;
      setColorsRef.current = (opt: Option) => {
        const next = colorize(opt.values, opt.diverging, n);
        if (first) {
          colorAttr.array.set(next);
          colorAttr.needsUpdate = true;
          first = false;
          to = next;
          return;
        }
        from.set(colorAttr.array as Float32Array);
        to = next;
        morphStart = performance.now();
      };

      let visible = true;
      let raf = 0;
      const loop = (now: number) => {
        raf = 0;
        if (morphStart >= 0) {
          const k = Math.min(1, (now - morphStart) / MORPH_MS);
          const e = easeInOut(k);
          const arr = colorAttr.array as Float32Array;
          for (let i = 0; i < arr.length; i++) arr[i] = from[i] + (to[i] - from[i]) * e;
          colorAttr.needsUpdate = true;
          if (k >= 1) morphStart = -1;
        }
        controls.update();
        renderer.render(scene, camera);
        if (visible && !document.hidden) raf = requestAnimationFrame(loop);
      };
      const kick = () => {
        if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop);
      };
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
        setColorsRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [data]);

  // применяем выбранное упражнение
  useEffect(() => {
    if (mode === "live" && current) setColorsRef.current?.(current);
  }, [mode, current]);

  const legendLow = current?.diverging ? text.diffLow : text.low;
  const legendHigh = current?.diverging ? text.diffHigh : text.high;

  if (mode === "none") return null;

  return (
    <figure className="s-brain" ref={boxRef}>
      <div className={`s-brain__stage${mode === "static" ? " is-static" : ""}`}>
        {mode === "static" ? (
          <img
            className="s-brain__static"
            src={`/site/brain-static-${lang}.webp`}
            alt={text.alt}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).hidden = true;
            }}
          />
        ) : (
          <div className="s-brain__canvas" ref={canvasHostRef} role="img" aria-label={current ? `${text.alt}: ${current.label}` : text.alt} />
        )}
        {(mode === "idle" || mode === "loading") && <p className="s-brain__loading s-small">{text.loading}</p>}
      </div>

      {mode === "live" && options.length > 1 && (
        <div className="s-brain__switch" role="radiogroup" aria-label={text.group}>
          {options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={i === active}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i + 1) % options.length);
                  (e.currentTarget.parentElement?.children[(i + 1) % options.length] as HTMLElement)?.focus();
                }
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const p = (i - 1 + options.length) % options.length;
                  setActive(p);
                  (e.currentTarget.parentElement?.children[p] as HTMLElement)?.focus();
                }
              }}
              tabIndex={i === active ? 0 : -1}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {mode === "live" && (
        <div className="s-brain__legend s-small" aria-hidden="true">
          <span>{legendLow}</span>
          <i className={current?.diverging ? "is-diverging" : undefined} />
          <span>{legendHigh}</span>
        </div>
      )}

      <figcaption className="s-small s-brain__caption">
        {data?.loads.meta?.model === "synthetic" ? `${text.caption} (${caveat})` : caveat || text.caption}
      </figcaption>
      <p className="s-brain__agree">{text.agreement}</p>
    </figure>
  );
}

export default BrainViewer;
