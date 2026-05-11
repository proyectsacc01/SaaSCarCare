"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./landing/landing.module.css";
import BackgroundMeteors from "@/componentes/BackgroundMeteors";
import LanguageSwitcher from "@/componentes/LanguageSwitcher";
import WavyButton from "@/components/ui/wavy-button";
import { useTranslation, useI18n } from "@/lib/i18n";
// SVG Icons
const CarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.1-1-1.9-1H5c-.8 0-1.4.4-1.9 1L1 10l-.6 1c-.6.9-.4 2.1.5 2.6.2.1.5.2.8.2H3v1c0 .6.4 1 1 1h1" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </svg>
);

const LocationIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const RouteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="19" r="3" />
    <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
    <circle cx="18" cy="5" r="3" />
  </svg>
);

const MessageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const LeafIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
);



const SmartphoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PackageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 9.4 7.55 4.24" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <line x1="12" x2="12" y1="22" y2="12" />
  </svg>
);

const AndroidIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none">
    <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.6 3 21.09 3 20.5Z" fill="#4285F4"/>
    <path d="M16.81 15.12L6.05 21.34L13.69 12L16.81 15.12Z" fill="#EA4335"/>
    <path d="M20.16 10.81C20.5 11.08 20.5 11.57 20.5 12C20.5 12.43 20.38 12.78 20.16 13.19L17.89 14.5L14.5 12L17.89 9.5L20.16 10.81Z" fill="#FBBC05"/>
    <path d="M6.05 2.66L16.81 8.88L13.69 12L6.05 2.66Z" fill="#34A853"/>
  </svg>
);



function getCurrentLandingWeekDayIndex(date = new Date()) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getMsUntilNextLocalDay(date = new Date()) {
  const nextDay = new Date(date);
  nextDay.setHours(24, 0, 0, 0);
  return nextDay.getTime() - date.getTime();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeTiltAxis(value: number) {
  return Math.sign(value) * Math.pow(Math.abs(value), 1.35);
}

export default function LandingPage() {
  const router = useRouter();
  const t = useTranslation();
  const { locale } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeWeekDayIndex, setActiveWeekDayIndex] = useState(() => getCurrentLandingWeekDayIndex());
  const [activeHeroKeywordIndex, setActiveHeroKeywordIndex] = useState(0);
  const [isDashboardPrecisionMode, setIsDashboardPrecisionMode] = useState(false);

  // Refs for scroll-triggered animations
  const heroVisualRef = useRef<HTMLDivElement>(null);
  const dashCardsWrapRef = useRef<HTMLDivElement>(null);
  const downloadVisualRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);
  const tiltRafRef = useRef<number | null>(null);
  const tiltCurrentRef = useRef({ x: 0, y: 0 });
  const tiltTargetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setIsVisible(true);

    const updateScroll = () => {
      const y = window.scrollY;
      setScrollY(y);
      // Actualizar la barra de progreso del navbar — sin re-renders React,
      // solo mutamos un CSS var en el <main> con el porcentaje recorrido.
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (y / docHeight) * 100) : 0;
      if (mainRef.current) {
        mainRef.current.style.setProperty('--scroll-progress', `${pct}%`);
      }
      rafRef.current = null;
    };

    const handleScroll = () => {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(updateScroll);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    let timerId: number;

    const syncActiveWeekDay = () => {
      setActiveWeekDayIndex(getCurrentLandingWeekDayIndex());
      timerId = window.setTimeout(syncActiveWeekDay, getMsUntilNextLocalDay() + 1000);
    };

    syncActiveWeekDay();

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    return () => {
      if (tiltRafRef.current !== null) {
        cancelAnimationFrame(tiltRafRef.current);
      }
    };
  }, []);

  // Intersection Observer for scroll-triggered animations
  useEffect(() => {
    const observerOptions = {
      threshold: [0, 0.1, 0.2, 0.3],
      rootMargin: '0px 0px -80px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          el.classList.add(styles.scrollVisible);
        }
      });
    }, observerOptions);

    const animatedElements = document.querySelectorAll(`.${styles.scrollReveal}`);
    animatedElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [isVisible]);

  const features = [
    {
      icon: <CarIcon />,
      title: t.landing.feature1Title,
      description: t.landing.feature1Desc,
      color: "#22c55e"
    },
    {
      icon: <LocationIcon />,
      title: t.landing.feature2Title,
      description: t.landing.feature2Desc,
      color: "#3bf63b"
    },
    {
      icon: <ChartIcon />,
      title: t.landing.feature3Title,
      description: t.landing.feature3Desc,
      color: "#0ee936"
    },
    {
      icon: <RouteIcon />,
      title: t.landing.feature4Title,
      description: t.landing.feature4Desc,
      color: "#04e13f"
    },
    {
      icon: <MessageIcon />,
      title: t.landing.feature5Title,
      description: t.landing.feature5Desc,
      color: "#25eb7b"
    },
    {
      icon: <LeafIcon />,
      title: t.landing.feature6Title,
      description: t.landing.feature6Desc,
      color: "#22c55e"
    }
  ];

  const heroKeywords = [
    t.landing.feature2Title,
    t.landing.feature3Title,
    t.landing.feature4Title,
    t.landing.feature5Title,
  ];

  const heroSignals = [
    { label: t.landing.liveMap, value: t.landing.activeVehiclesCount },
    { label: t.landing.statRefresh, value: "3s" },
    { label: t.landing.useCaseApp, value: "Android" },
  ];

  const motionBandItems = [
    t.landing.feature1Title,
    t.landing.feature2Title,
    t.landing.feature3Title,
    t.landing.feature4Title,
    t.landing.feature5Title,
    t.landing.feature6Title,
  ];

  const weeklyBars = [
    { day: t.landing.dayL, h: 45 },
    { day: t.landing.dayM, h: 70 },
    { day: t.landing.dayX, h: 55 },
    { day: t.landing.dayJ, h: 85 },
    { day: t.landing.dayV, h: 65 },
    { day: t.landing.dayS, h: 30 },
    { day: t.landing.dayD, h: 20 },
  ].map((bar, index) => ({
    ...bar,
    active: index === activeWeekDayIndex,
  }));

  const applyDashboardTilt = (tiltX: number, tiltY: number) => {
    if (!heroVisualRef.current) return;
    heroVisualRef.current.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
    heroVisualRef.current.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
  };

  const animateDashboardTilt = () => {
    const current = tiltCurrentRef.current;
    const target = tiltTargetRef.current;

    current.x += (target.x - current.x) * 0.16;
    current.y += (target.y - current.y) * 0.16;

    applyDashboardTilt(current.x, current.y);

    if (Math.abs(target.x - current.x) < 0.02 && Math.abs(target.y - current.y) < 0.02) {
      current.x = target.x;
      current.y = target.y;
      applyDashboardTilt(current.x, current.y);
      tiltRafRef.current = null;
      return;
    }

    tiltRafRef.current = requestAnimationFrame(animateDashboardTilt);
  };

  const setDashboardTiltTarget = (tiltX: number, tiltY: number) => {
    tiltTargetRef.current = { x: tiltX, y: tiltY };
    if (tiltRafRef.current === null) {
      tiltRafRef.current = requestAnimationFrame(animateDashboardTilt);
    }
  };

  const lockDashboardForPrecisionHover = () => {
    setIsDashboardPrecisionMode(true);
    setDashboardTiltTarget(0, 0);
  };

  const unlockDashboardPrecisionHover = () => {
    setIsDashboardPrecisionMode(false);
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveHeroKeywordIndex((current) => (current + 1) % heroKeywords.length);
    }, 2400);

    return () => window.clearInterval(intervalId);
  }, [heroKeywords.length]);

  return (
    <main className={styles.main} ref={mainRef}>
      <BackgroundMeteors fixed />
      {/* Subtle background gradient */}
      <div className={styles.bgGradient} />

      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}><CarIcon /></span>
            <span className={styles.logoText}>./CarCare Tracker</span>
          </div>
          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>{t.landing.features}</a>
            <a href="#how-it-works" className={styles.navLink}>{t.landing.howItWorks}</a>
            <a href="#download" className={styles.navLink}>{t.landing.download}</a>
            <LanguageSwitcher />
            <WavyButton
              variant="default"
              size="sm"
              radius="sm"
              onClick={() => router.push('/login')}
            >
              {t.landing.primaryCta}
            </WavyButton>
          </div>
          <div className={styles.navMobileActions}>
            <LanguageSwitcher />
            <button
              className={styles.navCtaMobile}
              onClick={() => router.push('/login')}
            >{t.auth.login}</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={`${styles.heroContent} ${isVisible ? styles.visible : ''}`}>
          <div className={styles.heroTag}>
            <span>{t.landing.heroTag}</span>
          </div>

          {locale === 'es' ? (
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleText}>
                {'Gestiona tu '}
                <span className={styles.letterF} aria-hidden="true">
                  {'f'}
                  <span className={styles.fCrossbarMask} />
                  <span className={styles.fCrossbarMark} />
                  <span className={styles.miniClawH}>
                    <svg viewBox="0 0 180 26" preserveAspectRatio="none" aria-hidden="true">
                      <line className={styles.clawCableStroke} x1="0" y1="13" x2="146" y2="13" />
                      <circle className={styles.clawHeadStroke} cx="154" cy="13" r="5.5" />
                      <path className={styles.fingerH1} d="M169 10 L157 6 L150 10" />
                      <path className={styles.fingerH2} d="M169 16 L157 20 L150 16" />
                    </svg>
                  </span>
                </span>
                <span className={styles.srOnly}>f</span>
                {'lota'}
              </span>
              <span className={`${styles.gradientText} ${styles.heroHighlight}`}>
                {' con '}
                <span className={styles.letterI} aria-hidden="true">
                  {'i'}
                  <span className={styles.iDotMask} />
                  <span className={styles.iDotMark} />
                  <span className={styles.miniClawV}>
                    <svg viewBox="0 0 26 140" preserveAspectRatio="none" aria-hidden="true">
                      <line className={styles.clawCableStroke} x1="13" y1="0" x2="13" y2="112" />
                      <circle className={styles.clawHeadStroke} cx="13" cy="120" r="5.5" />
                      <path className={styles.fingerV1} d="M10 135 L6 123 L10 116" />
                      <path className={styles.fingerV2} d="M16 135 L20 123 L16 116" />
                    </svg>
                  </span>
                </span>
                <span className={styles.srOnly}>i</span>
                {'nteligencia'}
              </span>
            </h1>
          ) : (
            <h1 className={styles.heroTitle}>
              <span>{t.landing.heroTitle}</span>
              <span className={`${styles.gradientText} ${styles.heroHighlight}`}>
                {' '}{t.landing.heroTitleHighlight}
              </span>
            </h1>
          )}

          <p className={styles.heroSubtitle}>
            {t.landing.heroSubtitle}
          </p>

          <div className={styles.heroDynamicLine}>
            <span className={styles.heroDynamicLabel}>{t.landing.modulesTag}</span>
            <div className={styles.heroDynamicWords}>
              {heroKeywords.map((keyword, index) => (
                <span
                  key={keyword}
                  className={`${styles.heroDynamicWord} ${index === activeHeroKeywordIndex ? styles.heroDynamicWordActive : ''}`}
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.heroCtas}>
            <WavyButton
              variant="success"
              size="lg"
              radius="sm"
              onClick={() => router.push('/login')}
            >
              <span>{t.landing.primaryCta}</span>
              <span className={styles.ctaArrow}><ArrowRightIcon /></span>
            </WavyButton>
            <a href="#download" className={styles.secondaryCta}>
              <span className={styles.androidIcon}><AndroidIcon /></span>
              <span>{t.landing.downloadCta}</span>
            </a>
          </div>

          <div className={styles.heroSignalRow}>
            {heroSignals.map((signal) => (
              <div key={`${signal.label}-${signal.value}`} className={styles.heroSignalCard}>
                <span className={styles.heroSignalPulse}></span>
                <div className={styles.heroSignalText}>
                  <strong>{signal.value}</strong>
                  <span>{signal.label}</span>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Hero Visual - 3D Dashboard con tilt parallax al mover el mouse */}
        <div
          className={styles.heroVisual}
          ref={heroVisualRef}
          style={{
            transform: `translateY(${scrollY * -0.08}px)`,
          }}
          onMouseMove={(e) => {
            if (isDashboardPrecisionMode) return;
            const bounds = dashCardsWrapRef.current?.getBoundingClientRect();
            if (!bounds) return;

            const px = clampNumber((e.clientX - bounds.left) / bounds.width, 0, 1);
            const py = clampNumber((e.clientY - bounds.top) / bounds.height, 0, 1);
            const centerX = px * 2 - 1;
            const centerY = py * 2 - 1;
            const easedX = easeTiltAxis(centerX);
            const easedY = easeTiltAxis(centerY);

            setDashboardTiltTarget(easedY * -3.2, easedX * 4.2);
          }}
          onMouseLeave={() => {
            setIsDashboardPrecisionMode(false);
            setDashboardTiltTarget(0, 0);
          }}
        >
          <div
            ref={dashCardsWrapRef}
            className={`${styles.dashCardsWrap} ${isDashboardPrecisionMode ? styles.dashCardsWrapPrecision : ''}`}
          >

            {/* Main map card - large */}
            <div className={`${styles.dashCard} ${styles.dashCardMap} ${styles.scrollReveal}`} style={{ '--delay': '0s' } as React.CSSProperties}>
              <div className={styles.dashCardHead}>
                <span className={styles.dashCardLabel}>{t.landing.liveMap}</span>
                <div className={styles.dashLiveBadge}>
                  <span className={styles.liveIndicator}></span>
                  <span>{t.landing.activeVehiclesCount}</span>
                </div>
              </div>
              <div className={styles.dashMapBody}>
                <svg className={styles.dashMapRoads} viewBox="0 0 420 180">
                  <path d="M 0 140 Q 80 120 150 80 Q 220 40 300 55 Q 380 70 420 30" stroke="rgba(255,255,255,0.05)" strokeWidth="14" fill="none" />
                  <path d="M 0 90 Q 60 110 140 60 Q 220 10 320 40 Q 380 55 420 20" stroke="rgba(255,255,255,0.04)" strokeWidth="9" fill="none" />
                  <path d="M 40 180 Q 100 150 200 130 Q 300 110 420 100" stroke="rgba(255,255,255,0.03)" strokeWidth="7" fill="none" />
                  {/* Route trace */}
                  <path d="M 50 130 C 120 100 180 50 260 55 C 340 60 370 35 400 25" stroke="rgba(59,246,59,0.12)" strokeWidth="10" fill="none" strokeLinecap="round" />
                  <path d="M 50 130 C 120 100 180 50 260 55 C 340 60 370 35 400 25" stroke="#3bf63b" strokeWidth="2.5" fill="none" strokeLinecap="round" className={styles.dashRoutePath} />
                  {/* Pins */}
                  <circle cx="50" cy="130" r="6" fill="#0f172a" stroke="#3bf63b" strokeWidth="2" />
                  <circle cx="50" cy="130" r="2.5" fill="#3bf63b" />
                  <circle cx="260" cy="55" r="5" fill="#0f172a" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                  <circle cx="260" cy="55" r="2" fill="rgba(255,255,255,0.5)" />
                  <circle cx="400" cy="25" r="6" fill="#0f172a" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                  <circle cx="400" cy="25" r="2.5" fill="rgba(255,255,255,0.5)" />
                </svg>
                {/* Vehicle on route */}
                <div className={styles.dashVehicle}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#3bf63b"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" /></svg>
                </div>
              </div>
            </div>

            {/* Stats cards row */}
            <div
              className={styles.dashStatsRow}
              onMouseEnter={lockDashboardForPrecisionHover}
              onMouseLeave={unlockDashboardPrecisionHover}
            >
              <div className={`${styles.dashCard} ${styles.dashCardStat} ${styles.scrollReveal}`} style={{ '--delay': '0.15s' } as React.CSSProperties}>
                <div className={styles.dashStatIcon}>
                  <CarIcon />
                </div>
                <div className={styles.dashStatData}>
                  <span className={styles.dashStatNum}>24</span>
                  <span className={styles.dashStatLabel}>{t.landing.vehicles}</span>
                </div>
              </div>
              <div className={`${styles.dashCard} ${styles.dashCardStat} ${styles.scrollReveal}`} style={{ '--delay': '0.25s' } as React.CSSProperties}>
                <div className={styles.dashStatIcon}>
                  <RouteIcon />
                </div>
                <div className={styles.dashStatData}>
                  <span className={styles.dashStatNum}>18</span>
                  <span className={styles.dashStatLabel}>{t.landing.onRoute}</span>
                </div>
              </div>
              <div className={`${styles.dashCard} ${styles.dashCardStat} ${styles.scrollReveal}`} style={{ '--delay': '0.35s' } as React.CSSProperties}>
                <div className={styles.dashStatIcon}>
                  <ChartIcon />
                </div>
                <div className={styles.dashStatData}>
                  <span className={styles.dashStatNum}>98%</span>
                  <span className={styles.dashStatLabel}>{t.landing.efficiency}</span>
                </div>
              </div>
            </div>

            {/* Bottom row - activity + chart */}
            <div
              className={styles.dashBottomRow}
              onMouseEnter={lockDashboardForPrecisionHover}
              onMouseLeave={unlockDashboardPrecisionHover}
            >
              <div className={`${styles.dashCard} ${styles.dashCardActivity} ${styles.scrollReveal}`} style={{ '--delay': '0.45s' } as React.CSSProperties}>
                <span className={styles.dashCardLabel}>{t.landing.recentActivity}</span>
                <div className={styles.dashActivityList}>
                  <div className={styles.dashActivityItem}>
                    <span className={styles.dashActivityDot} style={{ background: '#3bf63b' }}></span>
                    <span className={styles.dashActivityTxt}>{t.landing.activity1}</span>
                    <span className={styles.dashActivityTime}>{t.landing.activity1Time}</span>
                  </div>
                  <div className={styles.dashActivityItem}>
                    <span className={styles.dashActivityDot} style={{ background: '#eab308' }}></span>
                    <span className={styles.dashActivityTxt}>{t.landing.activity2}</span>
                    <span className={styles.dashActivityTime}>{t.landing.activity2Time}</span>
                  </div>
                  <div className={styles.dashActivityItem}>
                    <span className={styles.dashActivityDot} style={{ background: '#3bf63b' }}></span>
                    <span className={styles.dashActivityTxt}>{t.landing.activity3}</span>
                    <span className={styles.dashActivityTime}>{t.landing.activity3Time}</span>
                  </div>
                </div>
              </div>
              <div className={`${styles.dashCard} ${styles.dashCardChart} ${styles.scrollReveal}`} style={{ '--delay': '0.55s' } as React.CSSProperties}>
                <span className={styles.dashCardLabel}>{t.landing.weeklyConsumption}</span>
                <div className={styles.dashChartBars}>
                  {weeklyBars.map((b, i) => (
                    <div
                      key={i}
                      className={`${styles.dashBar} ${b.active ? styles.dashBarActive : ''}`}
                      style={{ '--bar-h': `${b.h}%` } as React.CSSProperties}
                      data-pct={`${b.h}%`}
                    >
                      <span>{b.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className={styles.motionBand}>
        <div className={styles.motionBandFadeLeft}></div>
        <div className={styles.motionBandFadeRight}></div>
        <div className={styles.motionBandTrack}>
          {[...motionBandItems, ...motionBandItems].map((item, index) => (
            <div key={`${item}-${index}`} className={styles.motionBandItem}>
              <span className={styles.motionBandDot}></span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={styles.features}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t.landing.featuresTag}</span>
          <h2 className={styles.sectionTitle}>
            {t.landing.featuresTitle}
          </h2>
          <p className={styles.sectionSubtitle}>
            {t.landing.featuresSubtitle}
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {features.map((feature, index) => (
            <div
              key={index}
              className={`${styles.featureCard} ${styles.scrollReveal}`}
              style={{ '--delay': `${index * 0.1}s` } as React.CSSProperties}
              onMouseMove={(e) => {
                // Spotlight que sigue al cursor — efecto premium tipo Stripe/Linear.
                // Actualizamos vars CSS para que el ::after las use sin re-render React.
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                target.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
                target.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
              }}
            >
              <div className={styles.featureIcon}>
                {feature.icon}
              </div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDesc}>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Metrics Section */}
      <section className={styles.metricsSection}>
        <div className={styles.metricsInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>{t.landing.modulesTag}</span>
            <h2 className={styles.sectionTitle}>{t.landing.modulesTitle}</h2>
            <p className={styles.sectionSubtitle}>{t.landing.modulesSubtitle}</p>
          </div>
          <div className={styles.metricsGrid}>
            {[
              { icon: <CarIcon />, number: '6', title: t.landing.mod1Title || 'Módulos integrados', desc: t.landing.mod1Desc },
              { icon: <LocationIcon />, number: '3s', title: t.landing.mod2Title || 'Refresh GPS', desc: t.landing.mod2Desc },
              { icon: <RouteIcon />, number: '2', title: t.landing.mod3Title || 'Tipos de mantenimiento', desc: t.landing.mod3Desc },
              { icon: <ChartIcon />, number: 'L/km', title: t.landing.mod4Title || 'Control de consumo', desc: t.landing.mod4Desc },
            ].map((m, i) => (
              <div key={i} className={`${styles.metricCard} ${styles.scrollReveal}`} style={{ '--delay': `${i * 0.12}s` } as React.CSSProperties}>
                <div className={styles.metricIconWrap}>{m.icon}</div>
                <div className={styles.metricNumber}>{m.number}</div>
                <div className={styles.metricTitle}>{m.title}</div>
                <div className={styles.metricDesc}>{m.desc}</div>
              </div>
            ))}
          </div>

          <div className={styles.testimonialRow}>
            <div className={`${styles.useCaseCard} ${styles.scrollReveal}`} style={{ '--delay': '0.1s' } as React.CSSProperties}>
              <div className={styles.useCaseTitle}>{t.landing.useCaseWeb}</div>
              <div className={styles.useCaseList}>
                {[
                  { title: t.landing.ucw1Title, desc: t.landing.ucw1Desc },
                  { title: t.landing.ucw2Title, desc: t.landing.ucw2Desc },
                  { title: t.landing.ucw3Title, desc: t.landing.ucw3Desc },
                  { title: t.landing.ucw4Title, desc: t.landing.ucw4Desc },
                  { title: t.landing.ucw5Title, desc: t.landing.ucw5Desc },
                ].map((uc, i) => (
                  <div key={i} className={styles.useCaseItem}>
                    <div className={styles.useCaseDot} />
                    <div className={styles.useCaseItemText}>
                      <strong>{uc.title}</strong>
                      <span>{uc.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${styles.useCaseCard} ${styles.scrollReveal}`} style={{ '--delay': '0.2s' } as React.CSSProperties}>
              <div className={styles.useCaseTitle}>{t.landing.useCaseApp}</div>
              <div className={styles.useCaseList}>
                {[
                  { title: t.landing.uca1Title, desc: t.landing.uca1Desc },
                  { title: t.landing.uca2Title, desc: t.landing.uca2Desc },
                  { title: t.landing.uca3Title, desc: t.landing.uca3Desc },
                  { title: t.landing.uca4Title, desc: t.landing.uca4Desc },
                  { title: t.landing.uca5Title, desc: t.landing.uca5Desc },
                ].map((uc, i) => (
                  <div key={i} className={styles.useCaseItem}>
                    <div className={styles.useCaseDot} />
                    <div className={styles.useCaseItemText}>
                      <strong>{uc.title}</strong>
                      <span>{uc.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className={styles.howItWorks}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t.landing.hiwTag}</span>
          <h2 className={styles.sectionTitle}>
            {t.landing.hiwTitle}
          </h2>
        </div>

        <div className={styles.stepsContainer}>
          <div className={`${styles.step} ${styles.scrollReveal}`} style={{ '--delay': '0s' } as React.CSSProperties}>
            <div className={styles.stepNumber}>01</div>
            <div className={styles.stepContent}>
              <h3>{t.landing.hiw1Title}</h3>
              <p>{t.landing.hiw1Desc}</p>
              <div className={styles.stepOutcome}>
                <CheckIcon /> {t.landing.hiw1Out}
              </div>
            </div>
            <div className={styles.stepIcon}><CarIcon /></div>
          </div>

          <div className={styles.stepConnector}>
            <div className={styles.connectorLine}></div>
            <div className={styles.connectorDot}></div>
          </div>

          <div className={`${styles.step} ${styles.scrollReveal}`} style={{ '--delay': '0.1s' } as React.CSSProperties}>
            <div className={styles.stepNumber}>02</div>
            <div className={styles.stepContent}>
              <h3>{t.landing.hiw2Title}</h3>
              <p>{t.landing.hiw2Desc}</p>
              <div className={styles.stepOutcome}>
                <CheckIcon /> {t.landing.hiw2Out}
              </div>
            </div>
            <div className={styles.stepIcon}><SmartphoneIcon /></div>
          </div>

          <div className={styles.stepConnector}>
            <div className={styles.connectorLine}></div>
            <div className={styles.connectorDot}></div>
          </div>

          <div className={`${styles.step} ${styles.scrollReveal}`} style={{ '--delay': '0.2s' } as React.CSSProperties}>
            <div className={styles.stepNumber}>03</div>
            <div className={styles.stepContent}>
              <h3>{t.landing.hiw3Title}</h3>
              <p>{t.landing.hiw3Desc}</p>
              <div className={styles.stepOutcome}>
                <CheckIcon /> {t.landing.hiw3Out}
              </div>
            </div>
            <div className={styles.stepIcon}><ChartIcon /></div>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className={styles.download}>
        <div className={styles.downloadContent}>
          <div className={styles.downloadInfo}>
            <span className={styles.sectionTag}>{t.landing.dlTag}</span>
            <h2 className={styles.downloadTitle}>
              {t.landing.dlTitlePrefix}{" "}
              <span className={styles.gradientText}>Android</span>
            </h2>
            <p className={styles.downloadDesc}>
              {t.landing.dlDesc}
            </p>

            <div className={styles.appFeatures}>
              <div className={styles.appFeature}>
                <span className={styles.checkIcon}><CheckIcon /></span>
                <span>{t.landing.dlFeat1}</span>
              </div>
              <div className={styles.appFeature}>
                <span className={styles.checkIcon}><CheckIcon /></span>
                <span>{t.landing.dlFeat2}</span>
              </div>
              <div className={styles.appFeature}>
                <span className={styles.checkIcon}><CheckIcon /></span>
                <span>{t.landing.dlFeat3}</span>
              </div>
              <div className={styles.appFeature}>
                <span className={styles.checkIcon}><CheckIcon /></span>
                <span>{t.landing.dlFeat4}</span>
              </div>
            </div>

            <div className={styles.downloadButtons}>
              <button className={styles.downloadBtn}>
                <div className={styles.downloadBtnContent}>
                  <span className={styles.downloadBtnIcon}><AndroidIcon /></span>
                  <div className={styles.downloadBtnText}>
                    <span className={styles.downloadBtnLabel}>{t.landing.dlBtnSubtitle}</span>
                    <span className={styles.downloadBtnPlatform}>Android</span>
                  </div>
                </div>
              </button>
              <div className={styles.downloadNote}>
                <PackageIcon />
                <span>{t.landing.dlNote}</span>
              </div>
            </div>
          </div>

          <div className={styles.downloadVisual} ref={downloadVisualRef}>
            <div className={`${styles.downloadPhone} ${styles.scrollReveal}`} style={{ '--delay': '0s' } as React.CSSProperties}>
              <div className={styles.phoneFrame}>
                <div className={styles.phoneNotch}></div>
                <div className={styles.phoneScreen}>

                  {/* Status bar */}
                  <div className={styles.phoneStatusBar}>
                    <span className={styles.phoneTime}>9:41</span>
                    <div className={styles.phoneSignals}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 0 0-6 0zm-4-4l2 2a7.074 7.074 0 0 1 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" /></svg>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" /></svg>
                    </div>
                  </div>

                  {/* App header */}
                  <div className={`${styles.appHeader} ${styles.scrollReveal}`} style={{ '--delay': '0.15s' } as React.CSSProperties}>
                    <div className={styles.appHeaderLeft}>
                      <span className={styles.appLogo}><CarIcon /></span>
                      <div className={styles.appHeaderText}>
                        <span className={styles.appHeaderTitle}>CarCare Driver</span>
                        <span className={styles.appHeaderSub}>{t.landing.driverActive}</span>
                      </div>
                    </div>
                    <div className={styles.appHeaderStatus}>
                      <span className={styles.liveIndicator}></span>
                      <span>{t.landing.statusOnline}</span>
                    </div>
                  </div>

                  {/* Route card */}
                  <div className={`${styles.appRoute} ${styles.scrollReveal}`} style={{ '--delay': '0.3s' } as React.CSSProperties}>
                    <div className={styles.routeTimeline}>
                      <div className={styles.routeDotOrigin}></div>
                      <div className={styles.routeLine}></div>
                      <div className={styles.routeDotDest}></div>
                    </div>
                    <div className={styles.routeDetails}>
                      <div className={styles.routePoint}>
                        <span className={styles.routeCity}>{t.landing.routeCityOrig}</span>
                        <span className={styles.routeTime}>{t.landing.routeTimeOrig}</span>
                      </div>
                      <div className={styles.routePoint}>
                        <span className={styles.routeCity}>{t.landing.routeCityDest}</span>
                        <span className={styles.routeTime}>{t.landing.routeTimeDest}</span>
                      </div>
                    </div>
                    <div className={styles.routeBadge}>
                      <span className={styles.liveIndicator}></span>
                      {t.landing.statusInProgress}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className={`${styles.appProgress} ${styles.scrollReveal}`} style={{ '--delay': '0.4s' } as React.CSSProperties}>
                    <div className={styles.progressHeader}>
                      <span className={styles.progressLabel}>{t.landing.routeProgress}</span>
                      <span className={styles.progressPct}>38%</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill}></div>
                      <div className={styles.progressDot}></div>
                    </div>
                  </div>

                  {/* Map area */}
                  <div className={`${styles.appMap} ${styles.scrollReveal}`} style={{ '--delay': '0.45s' } as React.CSSProperties}>
                    {/* Road network background */}
                    <svg className={styles.mapRoads} viewBox="0 0 250 150" preserveAspectRatio="none">
                      <path d="M 0 120 Q 40 110 80 90 Q 120 70 160 75 Q 200 80 250 50" stroke="rgba(255,255,255,0.06)" strokeWidth="12" fill="none" />
                      <path d="M 0 80 Q 50 95 100 60 Q 150 25 200 40 Q 230 48 250 30" stroke="rgba(255,255,255,0.04)" strokeWidth="8" fill="none" />
                      <path d="M 30 150 Q 60 130 100 120 Q 160 105 250 90" stroke="rgba(255,255,255,0.03)" strokeWidth="6" fill="none" />
                    </svg>
                    {/* Main route */}
                    <svg className={styles.appMapRoute} viewBox="0 0 250 150">
                      <path d="M 25 125 C 70 105 100 60 140 55 C 180 50 200 35 225 25" stroke="rgba(59,246,59,0.15)" strokeWidth="8" fill="none" strokeLinecap="round" />
                      <path d="M 25 125 C 70 105 100 60 140 55 C 180 50 200 35 225 25" stroke="#3bf63b" strokeWidth="2.5" fill="none" strokeLinecap="round" className={styles.appMapRoutePath} />
                      {/* Origin pin */}
                      <circle cx="25" cy="125" r="6" fill="#0f172a" stroke="#3bf63b" strokeWidth="2.5" />
                      <circle cx="25" cy="125" r="2.5" fill="#3bf63b" />
                      {/* Destination pin */}
                      <circle cx="225" cy="25" r="6" fill="#0f172a" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
                      <circle cx="225" cy="25" r="2.5" fill="rgba(255,255,255,0.6)" />
                    </svg>
                    {/* Vehicle indicator */}
                    <div className={styles.mapVehicle}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#3bf63b"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" /></svg>
                    </div>
                    <span className={styles.appMapLabel} style={{ bottom: '8px', left: '12px' }}>{t.landing.routeCityOrig}</span>
                    <span className={styles.appMapLabel} style={{ top: '6px', right: '12px' }}>{t.landing.routeCityDest === 'Barcelona' ? 'BCN' : (t.landing.routeCityDest === 'Porto' ? 'OPO' : 'LYS')}</span>
                  </div>

                  {/* Stats row */}
                  <div className={`${styles.appStats} ${styles.scrollReveal}`} style={{ '--delay': '0.6s' } as React.CSSProperties}>
                    <div className={styles.appStat}>
                      <span className={styles.appStatIcon}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                      </span>
                      <span className={styles.appStatValue}>623</span>
                      <span className={styles.appStatUnit}>km</span>
                      <span className={styles.appStatLabel}>{t.landing.statRemaining}</span>
                    </div>
                    <div className={styles.appStat}>
                      <span className={styles.appStatIcon}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      </span>
                      <span className={styles.appStatValue}>5h 30m</span>
                      <span className={styles.appStatLabel}>{t.landing.statEstTime}</span>
                    </div>
                    <div className={styles.appStat}>
                      <span className={styles.appStatIcon}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                      </span>
                      <span className={styles.appStatValue}>82</span>
                      <span className={styles.appStatUnit}>km/h</span>
                      <span className={styles.appStatLabel}>{t.landing.statSpeed}</span>
                    </div>
                  </div>

                </div>
              </div>
              <div className={styles.phoneGlow}></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <div className={styles.ctaBenefitGrid}>
            {[
              {
                icon: <CarIcon />,
                title: t.landing.cta1Title,
                desc: t.landing.cta1Desc,
              },
              {
                icon: <LocationIcon />,
                title: t.landing.cta2Title,
                desc: t.landing.cta2Desc,
              },
              {
                icon: <RouteIcon />,
                title: t.landing.cta3Title,
                desc: t.landing.cta3Desc,
              },
            ].map((b, i) => (
              <div key={i} className={`${styles.ctaBenefitCard} ${styles.scrollReveal}`} style={{ '--delay': `${i * 0.1}s` } as React.CSSProperties}>
                <div className={styles.ctaBenefitIconWrap}>{b.icon}</div>
                <div className={styles.ctaBenefitText}>
                  <strong>{b.title}</strong>
                  <p>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.ctaContent}>
            <h2 className={styles.ctaTitle}>
              {t.landing.startManaging}
            </h2>
            <p className={styles.ctaSubtitle}>
              {t.landing.startManagingDesc}
            </p>
            <WavyButton
              variant="success"
              size="lg"
              radius="sm"
              onClick={() => router.push('/login')}
            >
              <span>{t.landing.startNow}</span>
              <span className={styles.ctaArrow}><ArrowRightIcon /></span>
            </WavyButton>
            <div className={styles.ctaTrustLine}>
              <span className={styles.ctaTrustItem}>
                <CheckIcon /> {t.landing.registrationMinutes}
              </span>
              <span className={styles.ctaTrustItem}>
                <CheckIcon /> {t.landing.isolatedData}
              </span>
              <span className={styles.ctaTrustItem}>
                <CheckIcon /> {t.landing.multiPlatform}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}><CarIcon /></span>
              <span className={styles.logoText}>./CarCare Tracker</span>
            </div>
            <p className={styles.footerDesc}>
              {t.landing.footerDesc}
            </p>
          </div>
          <div className={styles.footerLinks}>
            <div className={styles.footerColumn}>
              <h4>{t.landing.footerProduct}</h4>
              <a href="#features">{t.landing.featuresTag}</a>
              <a href="#download">{t.landing.footerDownloadApp}</a>
              <a href="#how-it-works">{t.landing.hiwTag}</a>
            </div>
            <div className={styles.footerColumn}>
              <h4>{t.landing.footerCompany}</h4>
              <a href="#">{t.landing.footerAbout}</a>
              <a href="#">{t.landing.footerContact}</a>
              <a href="#">{t.landing.footerBlog}</a>
            </div>
            <div className={styles.footerColumn}>
              <h4>{t.landing.footerLegal}</h4>
              <a href="#">{t.landing.footerPrivacy}</a>
              <a href="#">{t.landing.footerTerms}</a>
              <a href="#">{t.landing.footerCookies}</a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 CarCare Tracker. {t.landing.footerRights}</span>
        </div>
      </footer>
    </main>
  );
}
