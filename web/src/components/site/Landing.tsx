"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import "@/styles/site.css";
import { dict, LANG_KEY, type Lang } from "./i18n";
import { BrainViewer } from "./BrainViewer";

function Arrow() {
  return (
    <svg className="s-arrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const privacyIcons = [
  // запись не хранится
  <svg key="mic" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>,
  // локально
  <svg key="device" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5.5h16v10H4zM2.5 19h19M10 12l1.6 1.6L15 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // удаление
  <svg key="trash" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10.5 10v6.5M13.5 10v6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
];

function BrowserFrame({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="s-browser">
      <div className="s-browser__bar" aria-hidden="true">
        <span className="s-browser__dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="s-browser__screen">
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
    </div>
  );
}

function PhoneFrame({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="s-phone">
      <div className="s-phone__screen">
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
    </div>
  );
}

// Язык лендинга: localStorage как внешнее хранилище, на сервере всегда ru.
const LANG_EVENT = "siriva-site-lang";
let memoryLang: Lang = "ru";

function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    /* хранилище недоступно */
  }
  return memoryLang;
}

function subscribeLang(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LANG_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LANG_EVENT, cb);
  };
}

function writeLang(next: Lang) {
  memoryLang = next;
  try {
    window.localStorage.setItem(LANG_KEY, next);
  } catch {
    /* остаётся в памяти до перезагрузки */
  }
  window.dispatchEvent(new Event(LANG_EVENT));
}

export function Landing() {
  const lang = useSyncExternalStore<Lang>(subscribeLang, readLang, () => "ru");
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const backRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const t = dict[lang];

  const chooseLang = (next: Lang) => writeLang(next);
  const closeMenu = () => setMenuOpen(false);

  // Escape закрывает меню и возвращает фокус на кнопку
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // появление по скроллу: прячем только то, что ниже первого экрана
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const vh = window.innerHeight;
    const pending = items.filter((el) => el.getBoundingClientRect().top > vh * 0.92);
    pending.forEach((el) => el.classList.add("rv-wait"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("rv-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );
    pending.forEach((el) => io.observe(el));
    // страховка: если блок проскочили быстрой прокруткой или он сдвинулся, раскрываем по позиции
    let raf = 0;
    const sweep = () => {
      raf = 0;
      const limit = window.innerHeight * 0.95;
      for (const el of pending) {
        if (!el.classList.contains("rv-in") && el.getBoundingClientRect().top < limit) {
          el.classList.add("rv-in");
          io.unobserve(el);
        }
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sweep);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // шапка и лёгкий параллакс скриншотов в hero
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 960px)");
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      headerRef.current?.classList.toggle("is-scrolled", y > 8);
      if (reduce || !wide.matches) {
        if (backRef.current) backRef.current.style.transform = "";
        if (frontRef.current) frontRef.current.style.transform = "";
        return;
      }
      const k = Math.min(y, 900);
      if (backRef.current) backRef.current.style.transform = `translate3d(0, ${(k * -0.05).toFixed(1)}px, 0)`;
      if (frontRef.current) frontRef.current.style.transform = `translate3d(0, ${(k * -0.13).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="site" lang={lang} ref={rootRef}>
      <a className="s-skip" href="#s-main">
        {t.meta.skip}
      </a>

      <header className="s-header" ref={headerRef}>
        <div className="s-wrap s-header__row">
          <a className="s-logo" href="#top" aria-label="Siriva">
            <img src="/site/logo-mark.png" width={28} height={28} alt="" className="s-logo__mark" />
            <span>Siriva</span>
          </a>
          <nav className="s-nav" aria-label={t.meta.menu}>
            <a href="#how">{t.nav.how}</a>
            <a href="#science">{t.nav.science}</a>
            <a href="#who">{t.nav.family}</a>
            <Link href="/demo">{t.nav.demo}</Link>
          </nav>
          <div className="s-header__end">
            <div className="s-lang" role="group" aria-label={t.meta.langLabel}>
              <button type="button" aria-pressed={lang === "ru"} onClick={() => chooseLang("ru")}>
                RU
              </button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => chooseLang("en")}>
                EN
              </button>
            </div>
            <Link className="s-btn s-btn--primary s-btn--sm" href="/app">
              {t.nav.start}
            </Link>
            <button
              ref={menuBtnRef}
              type="button"
              className="s-menu-btn"
              aria-expanded={menuOpen}
              aria-controls="s-menu"
              aria-label={t.meta.menu}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="M4 8h16M4 16h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>
        <nav id="s-menu" className="s-menu" hidden={!menuOpen} aria-label={t.meta.menu}>
          <div className="s-wrap">
            <a href="#how" onClick={closeMenu}>
              {t.nav.how}
            </a>
            <a href="#science" onClick={closeMenu}>
              {t.nav.science}
            </a>
            <a href="#who" onClick={closeMenu}>
              {t.nav.family}
            </a>
            <Link href="/demo" onClick={closeMenu}>
              {t.nav.demo}
            </Link>
          </div>
        </nav>
      </header>

      <main id="s-main">
        {/* HERO */}
        <section className="s-hero" id="top" aria-labelledby="s-hero-title">
          <div className="s-wrap s-hero__grid">
            <div className="s-hero__copy">
              <h1 id="s-hero-title" className="s-enter" style={{ ["--d" as string]: "0ms" }}>
                {t.hero.title}
              </h1>
              <p className="s-hero__sub s-enter" style={{ ["--d" as string]: "110ms" }}>
                {t.hero.sub}
              </p>
              <div className="s-actions s-enter" style={{ ["--d" as string]: "200ms" }}>
                <Link className="s-btn s-btn--primary" href="/app">
                  {t.hero.primary}
                  <Arrow />
                </Link>
                <Link className="s-btn s-btn--ghost" href="/family">
                  {t.hero.secondary}
                </Link>
              </div>
              <p className="s-hero__note s-enter" style={{ ["--d" as string]: "280ms" }}>
                {t.hero.note}
              </p>
            </div>
            <div className="s-hero__visual">
              <div className="s-hero__back" ref={backRef}>
                <div className="s-enter s-enter--far" style={{ ["--d" as string]: "160ms" }}>
                  <BrowserFrame src="/site/f2-profile-1280.png" alt={t.hero.altBrowser} eager />
                </div>
              </div>
              <div className="s-hero__front" ref={frontRef}>
                <div className="s-enter s-enter--far" style={{ ["--d" as string]: "300ms" }}>
                  <PhoneFrame src="/site/p1-today-375.png" alt={t.hero.altPhone} eager />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ПРОБЛЕМА */}
        <section className="s-section" aria-labelledby="s-problem-title">
          <div className="s-wrap">
            <h2 id="s-problem-title" className="s-h2 s-h2--wide" data-reveal>
              {t.problem.title}
            </h2>
            <ol className="s-facts">
              {t.problem.facts.map((f, i) => (
                <li key={f.href + i} className="s-fact" data-reveal style={{ ["--i" as string]: i }}>
                  <p className="s-fact__figure">{f.figure}</p>
                  <p className="s-fact__text">{f.text}</p>
                  <a className="s-fact__src" href={f.href} target="_blank" rel="noopener noreferrer">
                    {f.source}
                  </a>
                </li>
              ))}
            </ol>
            <p className="s-caveat" data-reveal>
              {t.problem.caveat}
            </p>
          </div>
        </section>

        {/* КАК РАБОТАЕТ */}
        <section className="s-section s-section--panel" id="how" aria-labelledby="s-how-title">
          <div className="s-wrap s-how">
            <div className="s-how__copy">
              <h2 id="s-how-title" className="s-h2" data-reveal>
                {t.how.title}
              </h2>
              <p className="s-lead" data-reveal style={{ ["--i" as string]: 1 }}>
                {t.how.lead}
              </p>
              <ol className="s-steps">
                {t.how.steps.map((s, i) => (
                  <li key={s.title} className="s-step" data-reveal style={{ ["--i" as string]: i + 1 }}>
                    <span className="s-step__n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="s-how__visual" data-reveal style={{ ["--i" as string]: 1 }}>
              <img className="s-ill" src="/site/ill-practice.webp" alt="" loading="lazy" decoding="async" />
            </div>
          </div>
        </section>

        {/* ДЛЯ КОГО */}
        <section className="s-section" id="who" aria-labelledby="s-who-title">
          <div className="s-wrap s-who">
            <div className="s-who__head">
              <h2 id="s-who-title" className="s-h2" data-reveal>
                {t.who.title}
              </h2>
              <img className="s-ill s-who__ill" src="/site/ill-family.webp" alt="" loading="lazy" decoding="async" data-reveal />
            </div>
            <ul className="s-who__list">
              {t.who.items.map((w, i) => (
                <li key={w.href} data-reveal style={{ ["--i" as string]: i }}>
                  <Link className="s-who__item" href={w.href}>
                    <h3>{w.title}</h3>
                    <p>{w.text}</p>
                    <span className="s-link">
                      {w.link}
                      <Arrow />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* НАУКА */}
        <section className="s-section s-section--dark" id="science" aria-labelledby="s-sci-title">
          <div className="s-wrap s-sci">
            <div className="s-sci__copy">
              <h2 id="s-sci-title" className="s-h2" data-reveal>
                {t.science.title}
              </h2>
              <p className="s-text" data-reveal style={{ ["--i" as string]: 1 }}>
                {t.science.body}
              </p>
              <p className="s-text s-sci__honest" data-reveal style={{ ["--i" as string]: 2 }}>
                {t.science.honest}
              </p>
            </div>
            <div className="s-sci__brain" data-reveal style={{ ["--i" as string]: 1 }}>
              <BrainViewer lang={lang} text={t.science.brain} />
            </div>
            <div className="s-sci__table" data-reveal>
              <p className="s-small">{t.science.tableTitle}</p>
              <dl>
                {t.science.rows.map((r, i) => (
                  <div key={r.label} className={i === 0 ? "is-main" : undefined}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="s-small s-sci__note">{t.science.tableNote}</p>
              <Link className="s-link s-link--light" href="/demo">
                {t.science.link}
                <Arrow />
              </Link>
            </div>
            <div className="s-sci__visual" data-reveal style={{ ["--i" as string]: 1 }}>
              <img className="s-shot" src="/site/d4-patient-b.png" alt={t.science.alt} width={600} height={553} loading="lazy" decoding="async" />
            </div>
          </div>
        </section>

        {/* ПРИВАТНОСТЬ */}
        <section className="s-section" aria-labelledby="s-priv-title">
          <div className="s-wrap s-priv">
            <div>
              <h2 id="s-priv-title" className="s-h2" data-reveal>
                {t.privacy.title}
              </h2>
              <p className="s-lead" data-reveal style={{ ["--i" as string]: 1 }}>
                {t.privacy.lead}
              </p>
            </div>
            <ul className="s-priv__list">
              {t.privacy.points.map((p, i) => (
                <li key={p.title} data-reveal style={{ ["--i" as string]: i }}>
                  <span className="s-priv__icon">{privacyIcons[i]}</span>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="s-cta" aria-labelledby="s-cta-title">
          <div className="s-wrap s-cta__box" data-reveal>
            <h2 id="s-cta-title" className="s-h2">
              {t.cta.title}
            </h2>
            <p className="s-lead">{t.cta.sub}</p>
            <div className="s-actions">
              <Link className="s-btn s-btn--primary" href="/app">
                {t.hero.primary}
                <Arrow />
              </Link>
              <Link className="s-btn s-btn--ghost" href="/family">
                {t.hero.secondary}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="s-footer">
        <div className="s-wrap s-footer__row">
          <div>
            <p className="s-footer__brand">Siriva</p>
            <p className="s-footer__tag">{t.footer.tagline}</p>
          </div>
          <nav className="s-footer__nav" aria-label={t.footer.nav}>
            <Link href="/app">{t.hero.primary}</Link>
            <Link href="/family">{t.hero.secondary}</Link>
            <Link href="/demo">{t.footer.jury}</Link>
          </nav>
        </div>
        <div className="s-wrap s-footer__legal">
          <p>{t.footer.disclaimer}</p>
          <p>{t.footer.synthetic}</p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
