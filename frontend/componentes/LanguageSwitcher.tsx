"use client";

import { useState, useRef, useEffect } from "react";
import type { ReactElement } from "react";
import { useI18n, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import styles from "./LanguageSwitcher.module.css";

// SVG flag components — renders correctly everywhere (no emoji issues)
const flags: Record<string, ReactElement> = {
  es: (
    <svg width="20" height="15" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="480" fill="#c60b1e"/>
      <rect width="640" height="240" y="120" fill="#ffc400"/>
    </svg>
  ),
  en: (
    <svg width="20" height="15" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="480" fill="#012169"/>
      <path d="M75 0l244 181L562 0h78v62L400 241l240 178v61h-80L320 302 82 480H0v-60l239-178L0 64V0h75z" fill="#fff"/>
      <path d="M424 281l216 159v40L369 281h55zm-184 20l6 35L54 480H0l240-179zM640 0v3L391 191l2-44L590 0h50zM0 0l239 176h-60L0 42V0z" fill="#C8102E"/>
      <path d="M241 0v480h160V0H241zM0 160v160h640V160H0z" fill="#fff"/>
      <path d="M0 193v96h640v-96H0zM273 0v480h96V0h-96z" fill="#C8102E"/>
    </svg>
  ),
  fr: (
    <svg width="20" height="15" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="213.3" height="480" fill="#002395"/>
      <rect width="213.3" height="480" x="213.3" fill="#fff"/>
      <rect width="213.4" height="480" x="426.6" fill="#ED2939"/>
    </svg>
  ),
  pt: (
    <svg width="20" height="15" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="480" fill="#060"/>
      <rect width="384" height="480" x="256" fill="#c00"/>
      <circle cx="256" cy="240" r="64" fill="#ff0" stroke="#060" strokeWidth="4"/>
    </svg>
  ),
  de: (
    <svg width="20" height="15" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="160" fill="#000"/>
      <rect width="640" height="160" y="160" fill="#D00"/>
      <rect width="640" height="160" y="320" fill="#FFCE00"/>
    </svg>
  ),
  it: (
    <svg width="20" height="15" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="213.3" height="480" fill="#009246"/>
      <rect width="213.3" height="480" x="213.3" fill="#fff"/>
      <rect width="213.4" height="480" x="426.6" fill="#CE2B37"/>
    </svg>
  ),
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const locales = Object.keys(LOCALE_LABELS) as Locale[];

  return (
    <div ref={ref} className={styles.wrapper}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={() => setOpen(!open)}
        title="Change language"
      >
        <span className={styles.flag}>
          {flags[locale]}
        </span>
        <span>{locale.toUpperCase()}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Dropdown — always in DOM, toggled via CSS */}
      <div className={`${styles.dropdown} ${open ? styles.dropdownVisible : ""}`}>
        {locales.map((loc) => (
          <button
            key={loc}
            className={`${styles.option} ${locale === loc ? styles.optionActive : ""}`}
            onClick={() => { setLocale(loc); setOpen(false); }}
          >
            <span className={styles.optionFlag}>
              {flags[loc]}
            </span>
            <span className={styles.optionLabel}>{LOCALE_LABELS[loc]}</span>
            <span className={styles.optionCheck}>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
