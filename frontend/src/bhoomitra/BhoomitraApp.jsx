import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import "./bhoomitra.css";
import { languages, translate } from "./localization";
import AccountSettings from "./AccountSettings.jsx";
import { analyzePhoto as analyzePlantPhoto } from "../services/plantHealthApi.js";
import {
  createCropLogEntry,
  getCropLog,
  getCurrentUser,
  loginFarmer,
  logoutFarmer,
  registerFarmer
} from "../services/farmerApi.js";

const LanguageContext = createContext({ language: "en", setLanguage: () => {}, t: (key) => key });

function useLanguage() {
  return useContext(LanguageContext);
}

const localeFallbacks = {
  brx: "hi-IN",
  doi: "hi-IN",
  kok: "mr-IN",
  mai: "hi-IN",
  mni: "bn-IN",
  sat: "hi-IN"
};
const weatherCodeKeys = {
  0: ["clearSky", "☀"],
  1: ["mainlyClear", "🌤"],
  2: ["partlyCloudy", "⛅"],
  3: ["overcast", "☁"],
  45: ["fog", "🌫"],
  48: ["fog", "🌫"],
  51: ["drizzle", "🌦"],
  53: ["drizzle", "🌦"],
  55: ["drizzle", "🌦"],
  61: ["rainy", "🌧"],
  63: ["rainy", "🌧"],
  65: ["rainy", "🌧"],
  66: ["rainy", "🌧"],
  67: ["rainy", "🌧"],
  71: ["snow", "❄"],
  73: ["snow", "❄"],
  75: ["snow", "❄"],
  80: ["rainShowers", "🌦"],
  81: ["rainShowers", "🌦"],
  82: ["rainShowers", "🌧"],
  95: ["thunderstorm", "⛈"],
  96: ["thunderstorm", "⛈"],
  99: ["thunderstorm", "⛈"]
};

const cropActivityTypes = [
  { id: "sowing", key: "activitySowing", icon: "🌱", keywords: ["पेरणी", "बुवाई", "sowing", "seed"] },
  { id: "fertilizer", key: "activityFertilizer", icon: "🌿", keywords: ["खत", "खाद", "उर्वरक", "fertilizer", "compost"] },
  { id: "spray", key: "activitySpray", icon: "💧", keywords: ["फवारणी", "छिड़काव", "spray", "pesticide"] },
  { id: "water", key: "activityWater", icon: "💦", keywords: ["पाणी", "पानी", "सिंचाई", "water", "irrigation"] },
  { id: "weeding", key: "activityWeeding", icon: "🌾", keywords: ["तण", "खरपतवार", "निराई", "weeding"] }
];

function getCropActivityType(title) {
  const normalizedTitle = title.toLocaleLowerCase();
  return cropActivityTypes.find((type) =>
    type.keywords.some((keyword) => normalizedTitle.includes(keyword))
  ) || null;
}

async function fetchWeatherAt(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
  const result = await response.json();
  const current = result.current;
  if (
    !current ||
    !Number.isFinite(current.temperature_2m) ||
    !Number.isFinite(current.relative_humidity_2m) ||
    !Number.isFinite(current.weather_code)
  ) {
    throw new Error("Weather service returned incomplete current conditions.");
  }
  return {
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    rainChance: Number.isFinite(current.precipitation_probability)
      ? current.precipitation_probability
      : null,
    weatherCode: current.weather_code
  };
}

async function reverseGeocode(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: "en"
  });
  const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`);
  if (!response.ok) throw new Error(`Reverse geocoding returned ${response.status}.`);
  const result = await response.json();
  const city = result.locality || result.city || result.localityInfo?.administrative?.[2]?.name;
  const region = result.principalSubdivision;
  return [city, region].filter(Boolean).join(", ") || result.countryName || "";
}

const inputHistory = [
  { date: "2026-09-18", nameKey: "tomatoSeeds", detailKey: "desiVariety", amount: 2, unitKey: "kilos", type: "Seed" },
  { date: "2026-10-02", nameKey: "organicCompost", detailKey: "farmCompost", amount: 80, unitKey: "kilos", type: "Fertilizer" },
  { date: "2026-10-08", nameKey: "neemOil", detailKey: "preventiveCropCare", amount: 500, unitKey: "litres", type: "Pesticide" }
];

const starterBatches = [
  {
    id: "TB-2026-014",
    batchNumber: "TB-2026-014",
    crop: "Desi Tomato",
    cropKey: "desiTomato",
    harvestDate: "2026-10-10",
    field: "Field 01",
    fieldKey: "fieldOneLabel",
    location: "Nashik, Maharashtra",
    quantity: 120,
    unit: "kg",
    farmerName: "Aarav Patil",
    inputs: inputHistory.map((item) => ({
      ...item,
      name: item.nameKey,
      quantity: item.amount,
      unit: item.unitKey === "kilos" ? "kg" : "ml"
    }))
  }
];

const storagePrefix = "bhoomitra-";
const legacyStoragePrefix = ["khet", "sathi-"].join("");

function migrateLegacyStorage() {
  const storageKeys = ["language", "crop-log", "trace-batches", "advisory-feedback", "weather-location", "location-denied", "farmer-name"];
  for (const key of storageKeys) {
    const currentKey = `${storagePrefix}${key}`;
    const previousKey = `${legacyStoragePrefix}${key}`;
    if (localStorage.getItem(currentKey) === null) {
      const previousValue = localStorage.getItem(previousKey);
      if (previousValue !== null) localStorage.setItem(currentKey, previousValue);
    }
    localStorage.removeItem(previousKey);
  }
}

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from local storage.`, error);
    return fallback;
  }
}

function formatLogDate(date, language = "en") {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  const locale = localeFallbacks[language] || language;
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(value);
  } catch {
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(value);
  }
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createStarterPlantPhotos() {
  return [];
}

function getDaysUntilPlantPhoto(today, photos) {
  const latestPhoto = [...photos].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latestPhoto) return 0;
  const lastPhotoDate = new Date(`${latestPhoto.date}T00:00:00`);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const elapsedDays = Math.floor((todayDate.getTime() - lastPhotoDate.getTime()) / 86400000);
  return Math.max(0, 5 - elapsedDays);
}

function getEntryText(entry, field) {
  return entry[field];
}

function getDeviceLanguage() {
  const deviceLanguage = navigator.languages?.[0] || navigator.language || "";
  if (deviceLanguage.toLowerCase().startsWith("mr")) return "mr";
  if (deviceLanguage.toLowerCase().startsWith("hi")) return "hi";
  return "en";
}

function BhoomitraApp() {
  const [today] = useState(() => new Date());
  const [plantPhotos, setPlantPhotos] = useState(createStarterPlantPhotos);
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("loading");
  const [authError, setAuthError] = useState("");
  const [language, setLanguage] = useState(() => {
    migrateLegacyStorage();
    const savedLanguage = localStorage.getItem("bhoomitra-language");
    return languages.some((item) => item.code === savedLanguage) ? savedLanguage : getDeviceLanguage();
  });
  const [isFirstLaunch] = useState(() => (
    localStorage.getItem("bhoomitra-has-seen-onboarding") !== "true"
      && localStorage.getItem("bhoomitra-language") === null
      && localStorage.getItem("bhoomitra-onboarding-in-progress") !== "true"
  ));
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() => {
    if (localStorage.getItem("bhoomitra-has-seen-onboarding") === "true") return true;
    return !isFirstLaunch && localStorage.getItem("bhoomitra-onboarding-in-progress") !== "true";
  });
  const [entries, setEntries] = useState([]);
  const [batches, setBatches] = useState(() =>
    readStored("bhoomitra-trace-batches", starterBatches)
  );
  const [feedback, setFeedback] = useState(() =>
    readStored("bhoomitra-advisory-feedback", null)
  );
  const [weatherLocation, setWeatherLocation] = useState(() =>
    readStored("bhoomitra-weather-location", null)
  );
  const [weatherState, setWeatherState] = useState(() => ({
    status: weatherLocation
      ? "loading"
      : localStorage.getItem("bhoomitra-location-denied") === "true" || !navigator.geolocation
        ? "unavailable"
        : "loading",
    current: null,
    error: ""
  }));

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(async (currentUser) => {
        if (!active) return;
        if (!currentUser) {
          setAuthStatus("anonymous");
          return;
        }
        const cropEntries = await getCropLog();
        if (!active) return;
        setUser(currentUser);
        setEntries(cropEntries);
        setAuthStatus("authenticated");
      })
      .catch((error) => {
        if (!active) return;
        setAuthError(error.message);
        setAuthStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const cachedLocation = readStored("bhoomitra-weather-location", null);

    async function loadLocation(location) {
      try {
        const current = await fetchWeatherAt(location.latitude, location.longitude);
        if (!active) return;
        setWeatherLocation(location);
        setWeatherState({ status: "ready", current, error: "" });
        try {
          localStorage.setItem("bhoomitra-weather-location", JSON.stringify(location));
          localStorage.removeItem("bhoomitra-location-denied");
        } catch (error) {
          console.error("Could not cache the weather location.", error);
        }
      } catch (error) {
        console.error("Could not load current weather.", error);
        if (active) setWeatherState({ status: "error", current: null, error: "weatherUnavailable" });
      }
    }

    function requestCurrentLocation() {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const location = { latitude: coords.latitude, longitude: coords.longitude, name: "" };
          try {
            const name = await reverseGeocode(coords.latitude, coords.longitude);
            location.name = name;
          } catch (error) {
            console.error("Could not identify the current location.", error);
          }
          loadLocation(location);
        },
        () => {
          if (!active) return;
          try {
            localStorage.setItem("bhoomitra-location-denied", "true");
          } catch (storageError) {
            console.error("Could not cache the location permission choice.", storageError);
          }
          setWeatherState({ status: "unavailable", current: null, error: "" });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    }

    if (cachedLocation && Number.isFinite(cachedLocation.latitude) && Number.isFinite(cachedLocation.longitude)) {
      loadLocation(cachedLocation);
    } else if (localStorage.getItem("bhoomitra-location-denied") === "true" || !navigator.geolocation) {
      return () => {
        active = false;
      };
    } else {
      requestCurrentLocation();
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (feedback) {
      localStorage.setItem("bhoomitra-advisory-feedback", JSON.stringify(feedback));
    }
  }, [feedback]);

  useEffect(() => {
    localStorage.setItem("bhoomitra-trace-batches", JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    const selectedLanguage = languages.find((item) => item.code === language) || languages[0];
    document.documentElement.lang = selectedLanguage.code;
    document.documentElement.dir = selectedLanguage.dir;
    localStorage.setItem("bhoomitra-language", language);
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    const largeText = localStorage.getItem("bhoomitra-setting-large-text") === "true";
    const highContrast = localStorage.getItem("bhoomitra-setting-high-contrast") === "true";
    const savedReducedMotion = localStorage.getItem("bhoomitra-setting-reduced-motion");
    root.dataset.textSize = largeText ? "large" : "normal";
    root.dataset.highContrast = String(highContrast);
    root.dataset.reducedMotion = savedReducedMotion
      ?? String(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (isFirstLaunch && !hasSeenOnboarding) {
      localStorage.setItem("bhoomitra-onboarding-in-progress", "true");
    }
  }, [hasSeenOnboarding, isFirstLaunch]);

  useEffect(() => {
    if (hasSeenOnboarding) {
      localStorage.setItem("bhoomitra-has-seen-onboarding", "true");
      localStorage.removeItem("bhoomitra-onboarding-in-progress");
    }
  }, [hasSeenOnboarding]);

  async function addEntry(entry) {
    const savedEntry = await createCropLogEntry(entry);
    setEntries((current) => [savedEntry, ...current]);
    return savedEntry;
  }

  function addBatch(batch) {
    setBatches((current) => [batch, ...current]);
  }

  function addPlantPhoto(photo) {
    setPlantPhotos((current) => [photo, ...current]);
  }

  function requestWeatherLocation() {
    if (!navigator.geolocation) {
      setWeatherState({ status: "unavailable", current: null, error: "" });
      return;
    }
    setWeatherState({ status: "loading", current: null, error: "" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let name = "";
        try {
          name = await reverseGeocode(coords.latitude, coords.longitude);
        } catch (error) {
          console.error("Could not identify the current location.", error);
        }
        const location = { latitude: coords.latitude, longitude: coords.longitude, name };
        try {
          const current = await fetchWeatherAt(location.latitude, location.longitude);
          setWeatherLocation(location);
          setWeatherState({ status: "ready", current, error: "" });
          try {
            localStorage.setItem("bhoomitra-weather-location", JSON.stringify(location));
            localStorage.removeItem("bhoomitra-location-denied");
          } catch (storageError) {
            console.error("Could not cache the weather location.", storageError);
          }
        } catch (error) {
          console.error("Could not load current weather.", error);
          setWeatherState({ status: "error", current: null, error: "weatherUnavailable" });
        }
      },
      () => {
        try {
          localStorage.setItem("bhoomitra-location-denied", "true");
        } catch (storageError) {
          console.error("Could not cache the location permission choice.", storageError);
        }
        setWeatherState({ status: "unavailable", current: null, error: "" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  async function selectWeatherLocation(location) {
    setWeatherState({ status: "loading", current: null, error: "" });
    try {
      const current = await fetchWeatherAt(location.latitude, location.longitude);
      setWeatherLocation(location);
      setWeatherState({ status: "ready", current, error: "" });
      try {
        localStorage.setItem("bhoomitra-weather-location", JSON.stringify(location));
        localStorage.removeItem("bhoomitra-location-denied");
      } catch (storageError) {
        console.error("Could not cache the weather location.", storageError);
      }
    } catch (error) {
      console.error("Could not load weather for the selected location.", error);
      setWeatherState({ status: "error", current: null, error: "weatherUnavailable" });
    }
  }

  function saveFeedback(answer) {
    setFeedback({ answer, date: new Date().toISOString() });
  }

  async function finishSignIn(authenticatedUser) {
    const cropEntries = await getCropLog();
    setUser(authenticatedUser);
    setEntries(cropEntries);
    setAuthStatus("authenticated");
  }

  async function signOut() {
    await logoutFarmer();
    setUser(null);
    setEntries([]);
    setAuthStatus("anonymous");
  }

  function finishOnboarding() {
    localStorage.setItem("bhoomitra-has-seen-onboarding", "true");
    localStorage.removeItem("bhoomitra-onboarding-in-progress");
    setHasSeenOnboarding(true);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: (key) => translate(language, key) }}>
      {authStatus === "loading" ? (
        <main className="ks-auth-loading" aria-label={translate(language, "loadingAccount")}>
          <section className="ks-loading-skeleton" aria-hidden="true">
            <span className="ks-skeleton ks-skeleton-heading" />
            <span className="ks-skeleton ks-skeleton-copy" />
            <div className="ks-skeleton-grid">
              <span className="ks-skeleton ks-skeleton-card" />
              <span className="ks-skeleton ks-skeleton-card" />
              <span className="ks-skeleton ks-skeleton-card" />
            </div>
            <span className="ks-skeleton ks-skeleton-card ks-skeleton-wide" />
          </section>
        </main>
      ) : authStatus === "error" ? (
        <main className="ks-auth-error" role="alert">{authError}</main>
      ) : !hasSeenOnboarding ? (
        <Onboarding onComplete={finishOnboarding} />
      ) : (
        <Routes>
          <Route index element={authStatus === "authenticated" ? <Navigate to="/dashboard" replace /> : <LoginPage onAuthenticated={finishSignIn} />} />
          <Route path="trace/:batchId" element={<PublicTracePage batches={batches} />} />
          <Route element={authStatus === "authenticated" ? <FarmerLayout today={today} user={user} onSignOut={signOut} /> : <Navigate to="/" replace />}>
            <Route path="dashboard" element={<Dashboard today={today} user={user} entries={entries} feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} onSelectLocation={selectWeatherLocation} daysUntilPlantPhoto={getDaysUntilPlantPhoto(today, plantPhotos)} />} />
            <Route path="crop-log" element={<CropLog today={today} entries={entries} onAddEntry={addEntry} />} />
            <Route path="advisory" element={<Advisory feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} />} />
            <Route path="plant-health" element={<PlantHealth today={today} photos={plantPhotos} onAddPhoto={addPlantPhoto} />} />
            <Route path="traceability" element={<Traceability batches={batches} onAddBatch={addBatch} farmerName={user?.name || ""} />} />
            <Route path="account-settings" element={<AccountSettings user={user} onUserUpdated={setUser} onSignOut={signOut} language={language} setLanguage={setLanguage} t={(key) => translate(language, key)} />} />
            <Route path="*" element={<Dashboard today={today} user={user} entries={entries} feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} onSelectLocation={selectWeatherLocation} daysUntilPlantPhoto={getDaysUntilPlantPhoto(today, plantPhotos)} />} />
          </Route>
          <Route path="*" element={<Navigate to={authStatus === "authenticated" ? "/dashboard" : "/"} replace />} />
        </Routes>
      )}
    </LanguageContext.Provider>
  );
}

function Onboarding({ onComplete }) {
  const { language, setLanguage, t } = useLanguage();
  const [stage, setStage] = useState("language");
  const [slide, setSlide] = useState(0);
  const slideKeys = ["onboardingSlideOne", "onboardingSlideTwo", "onboardingSlideThree"];

  function goNext() {
    if (slide === slideKeys.length - 1) {
      onComplete();
      return;
    }
    setSlide((current) => current + 1);
  }

  return (
    <main className="ks-onboarding">
      {stage === "language" ? (
        <section className="ks-onboarding-card ks-onboarding-language" aria-labelledby="onboarding-language-title">
          <span className="ks-brand ks-onboarding-brand"><span className="ks-brand-icon">B</span>Bhoomitra</span>
          <div className="ks-onboarding-language-icon" aria-hidden="true">文</div>
          <p className="ks-eyebrow">{t("onboardingStepLanguage")}</p>
          <h1 id="onboarding-language-title">{t("onboardingChooseLanguage")}</h1>
          <div className="ks-onboarding-language-options" role="group" aria-label={t("onboardingChooseLanguage")}>
            {languages.map((item) => (
              <button
                type="button"
                key={item.code}
                className={language === item.code ? "selected" : ""}
                aria-pressed={language === item.code}
                onClick={() => setLanguage(item.code)}
              >
                <span>{item.nativeName}</span>
                {language === item.code && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
          <button type="button" className="ks-primary-button ks-onboarding-next" onClick={() => setStage("slides")}>
            {t("next")} <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : (
        <section className="ks-onboarding-card ks-onboarding-welcome" aria-live="polite">
          <div className={`ks-onboarding-illustration ks-onboarding-illustration-${slide + 1}`} aria-hidden="true">
            <svg viewBox="0 0 240 190">
              <circle cx="120" cy="95" r="78" className="ks-onboarding-sun" />
              <path d="M26 145c38-20 70-22 94-5 28-20 60-18 94 4v25H26Z" className="ks-onboarding-field ks-onboarding-field-back" />
              <path d="M26 158c36-15 67-14 94 2 30-16 60-17 94-1v16H26Z" className="ks-onboarding-field ks-onboarding-field-front" />
              {slide === 0 && (
                <>
                  <path d="M119 131c1-29 8-47 28-65" className="ks-onboarding-stem" />
                  <path d="M125 105c-25-2-35-15-36-34 21 1 34 12 36 34Zm8-21c1-21 13-34 31-38 0 20-11 34-31 38Z" className="ks-onboarding-leaf" />
                  <path d="M103 131h41" className="ks-onboarding-stem" />
                </>
              )}
              {slide === 1 && (
                <>
                  <rect x="81" y="48" width="78" height="95" rx="12" className="ks-onboarding-note" />
                  <path d="M101 76h39M101 94h39M101 112h25" className="ks-onboarding-lines" />
                  <circle cx="91" cy="76" r="3" className="ks-onboarding-dot" />
                  <circle cx="91" cy="94" r="3" className="ks-onboarding-dot" />
                </>
              )}
              {slide === 2 && (
                <>
                  <path d="M91 124V81l29-20 29 20v43" className="ks-onboarding-home" />
                  <path d="M82 84l38-27 38 27M111 124V98h18v26" className="ks-onboarding-home" />
                  <circle cx="160" cy="57" r="16" className="ks-onboarding-harvest" />
                  <path d="M160 45c-1 8-1 15 0 24m-10-12h20" className="ks-onboarding-harvest-line" />
                </>
              )}
            </svg>
          </div>
          <h1>{t(slideKeys[slide])}</h1>
          <div className="ks-onboarding-progress" aria-label={`${slide + 1} / ${slideKeys.length}`}>
            {slideKeys.map((key, index) => (
              <span key={key} className={index === slide ? "active" : ""} />
            ))}
          </div>
          <div className="ks-onboarding-actions">
            <button type="button" className="ks-onboarding-skip" onClick={onComplete}>{t("skip")}</button>
            <button type="button" className="ks-primary-button" onClick={goNext}>
              {slide === slideKeys.length - 1 ? t("onboardingStart") : t("next")}
              <span aria-hidden="true">{slide === slideKeys.length - 1 ? "✓" : "→"}</span>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function LoginPage({ onAuthenticated }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setAuthNotice("");
    if (isRegistering && password !== confirmPassword) {
      setFormError(t("passwordMismatch"));
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const authenticatedUser = isRegistering
        ? await registerFarmer({ name: name.trim(), email, password })
        : await loginFarmer({ email, password, rememberMe });
      await onAuthenticated(authenticatedUser);
      navigate("/dashboard");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="ks-login-page">
      <div className="ks-login-art">
        <div className="ks-login-art-copy">
          <span className="ks-eyebrow">{t("tagline").toUpperCase()}</span>
          <h1>{t("loginHeadline")}</h1>
          <p>{t("loginSubheading")}</p>
        </div>
        <span className="ks-art-caption">Bhoomitra · {t("tagline")}</span>
      </div>
      <section className="ks-login-card">
        <div className="ks-login-language"><LanguageSelect language={language} onChange={setLanguage} t={t} /></div>
        <span className="ks-back-link">{t("workspace").toUpperCase()}</span>
        <div className="ks-brand ks-login-brand"><span className="ks-brand-icon">B</span>Bhoomitra</div>
        <p className="ks-eyebrow">{t("welcomeFarmer")}</p>
        <h2>{isRegistering ? t("createAccount") : t("signIn")}</h2>
        <p className="ks-login-description">
          {isRegistering ? t("registerDescription") : t("loginDescription")}
        </p>
        <form onSubmit={handleSubmit} className="ks-login-form">
          {isRegistering && (
            <div className="ks-login-field">
              <label htmlFor="farmer-name">{t("yourName")}</label>
              <input
                id="farmer-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("enterName")}
                autoComplete="name"
                required
                maxLength={80}
              />
            </div>
          )}
          <div className="ks-login-field">
            <label htmlFor="farmer-email">{t("emailAddress")}</label>
            <input
              id="farmer-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("enterEmail")}
              autoComplete="email"
              required
            />
          </div>
          <div className="ks-login-field">
            <label htmlFor="farmer-password">{t("password")}</label>
            <div className="ks-password-input">
              <input
                id="farmer-password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegistering ? "new-password" : "current-password"}
                minLength={8}
                required
              />
              <button
                type="button"
                className="ks-password-toggle"
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2-2.2 2.9" />
                      <path d="M6.2 6.2C4.2 7.5 2.9 9.5 2.5 12c.7 1.9 2.9 4.3 5.7 5.4" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
          {!isRegistering && (
            <div className="ks-login-options">
              <label className="ks-remember-option">
                <input type="checkbox" name="rememberMe" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                <span>{t("rememberMe")}</span>
              </label>
              <button
                type="button"
                className="ks-forgot-password"
                onClick={() => setAuthNotice(t("passwordResetUnavailable"))}
              >
                {t("forgotPassword")}
              </button>
            </div>
          )}
          {isRegistering && (
            <div className="ks-login-field">
              <label htmlFor="farmer-confirm-password">{t("confirmPassword")}</label>
              <input
                id="farmer-confirm-password"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          )}
          {formError && <p className="ks-form-error" role="alert">{formError}</p>}
          {authNotice && <p className="ks-login-notice" role="status">{authNotice}</p>}
          <button type="submit" className="ks-primary-button" disabled={isSubmitting}>
            {isSubmitting && <span className="ks-login-spinner" aria-hidden="true" />}
            {isSubmitting ? t("loading") : isRegistering ? t("createAccount") : t("signIn")}
          </button>
        </form>
        <p className="ks-auth-switch">
          {isRegistering ? t("alreadyHaveAccount") : t("noAccount")}
          <button type="button" onClick={() => {
            setIsRegistering((registering) => !registering);
            setFormError("");
          }}>
            {isRegistering ? t("signIn") : t("createAccount")}
          </button>
        </p>
      </section>
    </main>
  );
}

function LanguageSelect({ language, onChange, t }) {
  return (
    <label className="ks-language-select" data-tour-target="language">
      <span aria-hidden="true">文</span>
      <span>{t("language")}</span>
      <select
        value={language}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t("language")}
      >
        {languages.map((item) => (
          <option value={item.code} key={item.code}>{item.nativeName}</option>
        ))}
      </select>
    </label>
  );
}

const farmerTourSteps = [
  { target: "overview", title: "tourOverviewTitle", body: "tourOverviewBody" },
  { target: "crop-log", title: "tourCropTitle", body: "tourCropBody" },
  { target: "plant-health", title: "tourPlantTitle", body: "tourPlantBody" },
  { target: "traceability", title: "tourTraceTitle", body: "tourTraceBody" }
];

function FarmerTour({ step, onStepChange, onClose }) {
  const { t } = useLanguage();
  const [targetRect, setTargetRect] = useState(null);
  const currentStep = farmerTourSteps[step];

  useEffect(() => {
    const updateTarget = () => {
      const target = document.querySelector(`[data-tour-target="${currentStep.target}"]`);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({
        x: rect.left - 6,
        y: rect.top - 6,
        width: rect.width + 12,
        height: rect.height + 12
      });
    };

    updateTarget();
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [currentStep]);

  function nextStep() {
    if (step === farmerTourSteps.length - 1) {
      onClose();
    } else {
      onStepChange(step + 1);
    }
  }

  return (
    <div className="ks-tour-overlay">
      {targetRect && (
        <svg className="ks-tour-spotlight" aria-hidden="true">
          <defs>
            <mask id="ks-tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.x}
                y={targetRect.y}
                width={targetRect.width}
                height={targetRect.height}
                rx="16"
                fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(16, 35, 23, 0.68)" mask="url(#ks-tour-mask)" />
          <rect
            className="ks-tour-spotlight-ring"
            x={targetRect.x}
            y={targetRect.y}
            width={targetRect.width}
            height={targetRect.height}
            rx="16"
          />
        </svg>
      )}
      <section className="ks-tour-card" role="dialog" aria-modal="true" aria-labelledby="ks-tour-title">
        <p className="ks-eyebrow">{t("tourStep").replace("{current}", String(step + 1)).replace("{total}", String(farmerTourSteps.length))}</p>
        <h2 id="ks-tour-title">{t(currentStep.title)}</h2>
        <p>{t(currentStep.body)}</p>
        <div className="ks-tour-actions">
          <button type="button" className="ks-tour-skip" onClick={onClose}>{t("skipTour")}</button>
          {step > 0 && <button type="button" className="ks-tour-back" onClick={() => onStepChange(step - 1)}>{t("back")}</button>}
          <button type="button" className="ks-primary-button" onClick={nextStep}>
            {step === farmerTourSteps.length - 1 ? t("done") : t("next")}
          </button>
        </div>
      </section>
    </div>
  );
}

function FarmerLayout({ today, user, onSignOut }) {
  const { language, setLanguage, t } = useLanguage();
  const [signOutError, setSignOutError] = useState("");
  const [tourStep, setTourStep] = useState(null);
  const farmerName = user.name;

  async function handleSignOut() {
    try {
      await onSignOut();
    } catch (error) {
      setSignOutError(error.message);
    }
  }

  return (
    <div className="ks-app">
      <aside className="ks-sidebar">
        <Link to="/dashboard" className="ks-brand">
          <span className="ks-brand-icon">B</span>Bhoomitra
        </Link>
        <p className="ks-sidebar-label">{t("farmManagement")}</p>
        <nav className="ks-nav" aria-label={t("farmerDashboard")}>
          <NavLink to="/dashboard" data-tour-target="overview"><span aria-hidden="true">⌂</span><span className="ks-nav-label">{t("overview")}</span></NavLink>
          <NavLink to="/crop-log" data-tour-target="crop-log"><span aria-hidden="true">☷</span><span className="ks-nav-label">{t("cropLog")}</span></NavLink>
          <NavLink to="/advisory"><span aria-hidden="true">✳</span><span className="ks-nav-label">{t("advisory")}</span></NavLink>
          <NavLink to="/plant-health" data-tour-target="plant-health"><span className="ks-nav-leaf" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 4c-8 0-14 3.5-14 10a6 6 0 0 0 6 6c6.5 0 8-8 8-16Z" /><path d="M4 21c3-5 7-8 12-11" /></svg></span><span className="ks-nav-label">{t("plantHealth")}</span></NavLink>
          <NavLink to="/traceability" data-tour-target="traceability"><span aria-hidden="true">▦</span><span className="ks-nav-label">{t("traceability")}</span></NavLink>
          <NavLink to="/account-settings"><span aria-hidden="true">⚙</span><span className="ks-nav-label">{t("accountSettings")}</span></NavLink>
        </nav>
        <div className="ks-sidebar-bottom">
          {user.avatarData
            ? <img className="ks-user-avatar" src={user.avatarData} alt="" />
            : <div className="ks-user-avatar">{farmerName.charAt(0).toUpperCase()}</div>}
          <div className="ks-user-copy"><strong>{farmerName}</strong><span>{t("farmerProfile")}</span></div>
          <button
            type="button"
            className="ks-logout"
            aria-label={t("signOut")}
            onClick={handleSignOut}
          >
            ↗
          </button>
        </div>
        {signOutError && <p className="ks-sidebar-error" role="alert">{signOutError}</p>}
      </aside>
      <div className="ks-main">
        <header className="ks-topbar">
          <div>
            <p className="ks-topbar-date">{today.toLocaleDateString(localeFallbacks[language] || language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="ks-topbar-context">{t("fieldsLookingGood")}</p>
          </div>
          <div className="ks-topbar-tools">
            <button type="button" className="ks-mobile-logout" aria-label={t("signOut")} onClick={handleSignOut}>↗</button>
            <LanguageSelect language={language} onChange={setLanguage} t={t} />
            <button type="button" className="ks-help-button" aria-label={t("openTour")} title={t("openTour")} data-tour-target="help" onClick={() => setTourStep(0)}>?</button>
            <span className="ks-workspace-tag">BHOOMITRA</span>
          </div>
        </header>
        <main className="ks-content"><Outlet /></main>
      </div>
      {tourStep !== null && (
        <FarmerTour
          step={tourStep}
          onStepChange={setTourStep}
          onClose={() => setTourStep(null)}
        />
      )}
    </div>
  );
}

function Dashboard({
  today,
  user,
  entries,
  feedback,
  onFeedback,
  weatherState,
  weatherLocation,
  onRequestLocation,
  onSelectLocation,
  daysUntilPlantPhoto
}) {
  const { language, t } = useLanguage();
  const recentEntry = entries[0];

  return (
    <>
      <div className="ks-page-heading">
        <div>
          <p className="ks-eyebrow">{today.toLocaleDateString(localeFallbacks[language] || language, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</p>
          <h1>{t("goodMorning")}, {user.name} <span>☀</span></h1>
          <p>{t("dashboardIntro")}</p>
        </div>
        <Link to="/crop-log" className="ks-primary-button ks-heading-button">＋ {t("logFarmActivity")}</Link>
      </div>
      {entries.length === 0 && (
        <Link to="/crop-log" className="ks-dashboard-first-entry-hint">
          <span aria-hidden="true">✳</span>{t("firstEntryHomeHint")} <strong>＋</strong>
        </Link>
      )}

      {daysUntilPlantPhoto === 0 && (
        <Link to="/plant-health" className="ks-plant-due-banner">
          <span className="ks-plant-due-icon" aria-hidden="true">♧</span>
          <span><strong>{t("plantPhotoDue")}</strong><small>{t("plantPhotoDueDescription")}</small></span>
          <span className="ks-plant-due-action">{t("takePhotoNow")} →</span>
        </Link>
      )}

      <section className="ks-stat-grid" aria-label={t("farmOverview")}>
        <article className="ks-stat-card ks-crop-stat">
          <div className="ks-stat-top"><span className="ks-stat-icon">♧</span><span className="ks-status-pill">{t("cropLog")}</span></div>
          <p className="ks-stat-label">{t("recentActivity").toUpperCase()}</p>
          <h2>{recentEntry ? recentEntry.title : t("noActivitiesYet")}</h2>
          <p className="ks-stat-foot">{recentEntry ? formatLogDate(recentEntry.date, language) : t("addFirstActivity")}</p>
        </article>
        <article className="ks-stat-card">
          <div className="ks-stat-top"><span className="ks-stat-icon ks-icon-lime">◷</span><span className="ks-stat-trend">↗ {t("onTrack")}</span></div>
          <p className="ks-stat-label">{t("activitiesLogged").toUpperCase()}</p>
          <h2>{entries.length}</h2>
          <p className="ks-stat-foot">{t("savedToAccount")}</p>
        </article>
        <article className="ks-stat-card ks-weather-card">
          <WeatherCard
            weatherState={weatherState}
            weatherLocation={weatherLocation}
            onRequestLocation={onRequestLocation}
            onSelectLocation={onSelectLocation}
          />
        </article>
      </section>

      <section className="ks-dashboard-grid">
        <article className="ks-panel ks-reminder-panel">
          <div className="ks-panel-heading">
            <div><p className="ks-eyebrow">{t("upNext").toUpperCase()}</p><h2>{t("nextReminder")}</h2></div>
            <span className="ks-reminder-icon">◷</span>
          </div>
          <div className="ks-reminder-content">
            <span className="ks-reminder-date">{new Intl.DateTimeFormat(localeFallbacks[language] || language, { month: "short" }).format(new Date(today.getFullYear(), 9, 15))} <strong>15</strong></span>
            <div><h3>{t("checkTomatoPlants")}</h3><p>{t("inspectSoil")}</p></div>
          </div>
          <p className="ks-weather-advice">✳ &nbsp;{t("weatherAdvice")}</p>
        </article>
        <article className="ks-panel ks-log-preview">
          <div className="ks-panel-heading">
            <div><p className="ks-eyebrow">{t("fieldOneDesiTomato").toUpperCase()}</p><h2>{t("recentActivity")}</h2></div>
            <Link to="/crop-log" className="ks-inline-link">{t("viewLog")} →</Link>
          </div>
          {entries.slice(0, 2).map((entry) => (
            <div className="ks-mini-entry" key={entry.id}>
              <span className="ks-mini-dot" />
              <div><strong>{t("day")} {entry.day}: {getEntryText(entry, "title", t)}</strong><span>{formatLogDate(entry.date, language)}</span></div>
            </div>
          ))}
        </article>
      </section>

      <AdvisoryCard feedback={feedback} onFeedback={onFeedback} />

      <section className="ks-trace-banner">
        <div><span className="ks-eyebrow">{t("traceability").toUpperCase()}</span><h2>{t("fromFieldToTable")}</h2><p>{t("traceBannerDescription")}</p></div>
        <Link to="/traceability" className="ks-light-button">{t("viewBatchTraceability")} <span>→</span></Link>
        <span className="ks-banner-leaf" aria-hidden="true">♧</span>
      </section>
    </>
  );
}

function WeatherCard({ weatherState, weatherLocation, onRequestLocation, onSelectLocation }) {
  const { t } = useLanguage();
  const [editingLocation, setEditingLocation] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const presentation = weatherState.current
    ? weatherCodeKeys[weatherState.current.weatherCode] || ["weatherUnavailable", "☁"]
    : ["weatherUnavailable", "☁"];

  async function searchCity(event) {
    event.preventDefault();
    const query = cityQuery.trim();
    if (!query) return;
    setSearchError("");
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ name: query, count: "5", language: "en", format: "json" });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) throw new Error(`Geocoding service returned ${response.status}.`);
      const result = await response.json();
      if (!result.results?.length) {
        setSearchError("locationNotFound");
        return;
      }
      setSearchResults(result.results);
    } catch (error) {
      console.error("Could not search for the requested city.", error);
      setSearchError("locationSearchError");
    }
  }

  function chooseCity(city) {
    const location = {
      latitude: city.latitude,
      longitude: city.longitude,
      name: [city.name, city.admin1].filter(Boolean).join(", ")
    };
    onSelectLocation(location);
    setEditingLocation(false);
    setSearchResults([]);
    setCityQuery("");
  }

  return (
    <>
      <div className="ks-weather-heading">
        <span className={`ks-stat-icon ${presentation[0] === "clearSky" ? "ks-icon-sun" : "ks-icon-lime"}`} aria-hidden="true">
          {weatherState.current ? presentation[1] : "☀"}
        </span>
        <span className="ks-weather-place">{weatherLocation?.name || t("chooseLocation")}</span>
        <button
          type="button"
          className="ks-weather-edit"
          aria-label={t("editLocation")}
          title={t("editLocation")}
          onClick={() => setEditingLocation((editing) => !editing)}
        >✎</button>
      </div>
      {editingLocation && (
        <div className="ks-weather-location-edit">
          <form onSubmit={searchCity}>
            <label className="ks-weather-search-label" htmlFor="weather-city-search">{t("searchCity")}</label>
            <input
              id="weather-city-search"
              type="search"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              placeholder={t("searchCity")}
              aria-label={t("searchCity")}
            />
            <button type="submit" className="ks-secondary-button">{t("search")}</button>
          </form>
          {searchError && <p role="alert">{t(searchError)}</p>}
          {searchResults.length > 0 && (
            <div className="ks-weather-search-results">
              {searchResults.map((city) => (
                <button type="button" key={`${city.id}-${city.latitude}`} onClick={() => chooseCity(city)}>
                  {[city.name, city.admin1, city.country].filter(Boolean).join(", ")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {weatherState.status === "loading" ? (
        <p className="ks-weather-loading">{t("gettingLocation")}</p>
      ) : weatherState.current ? (
        <>
          <div className="ks-weather-main">
            <strong>{Math.round(weatherState.current.temperature)}°</strong>
            <span>{t(presentation[0])}</span>
          </div>
          <div className="ks-weather-meta">
            <span>{t("humidity")} <strong>{weatherState.current.humidity}%</strong></span>
            <span>{t("rain")} <strong>{weatherState.current.rainChance === null ? "—" : `${weatherState.current.rainChance}%`}</strong></span>
          </div>
        </>
      ) : (
        <div className="ks-weather-fallback">
          <p>{t(weatherState.error || "locationUnavailable")}</p>
          <button type="button" className="ks-secondary-button" onClick={onRequestLocation}>{t("enableLocation")}</button>
        </div>
      )}
    </>
  );
}

function CropLog({ today, entries, onAddEntry }) {
  const { language, t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedType, setSelectedType] = useState(cropActivityTypes[0]);
  const [date, setDate] = useState(() => formatInputDate(today));
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const dialogRef = useRef(null);
  const voiceRecognitionRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const isSavingRef = useRef(isSaving);
  const speechRecognitionSupported = typeof window !== "undefined"
    && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    if (!formOpen) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector("input[type='date']")?.focus();
    });

    function keepFocusInDialog(event) {
      if (event.key === "Escape") {
        if (!isSavingRef.current) setFormOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = [...dialogRef.current.querySelectorAll(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )].filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInDialog);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocusInDialog);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [formOpen]);

  useEffect(() => () => {
    window.clearTimeout(toastTimeoutRef.current);
    voiceRecognitionRef.current?.stop();
  }, []);

  function openForm(type = cropActivityTypes[0]) {
    setSelectedType(type);
    setDate(formatInputDate(today));
    setDescription("");
    setPhotoUrl("");
    setPhotoError("");
    setSaveError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (!isSaving) setFormOpen(false);
  }

  function handleVoiceInput() {
    if (isListening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "mr-IN";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      setDescription((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => setSaveError(t("voiceInputError"));
    recognition.onend = () => setIsListening(false);
    voiceRecognitionRef.current = recognition;
    setSaveError("");
    setIsListening(true);
    recognition.start();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await onAddEntry({
        day: entries.length + 1,
        date,
        title: t(selectedType.key),
        description: description.trim(),
        photoUrl
      });
      setFormOpen(false);
      setToastVisible(true);
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = window.setTimeout(() => setToastVisible(false), 3200);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError(t("chooseImage"));
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError(t("imageTooLarge"));
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoUrl(reader.result);
        setPhotoError("");
      } else {
        setPhotoError(t("imageReadError"));
      }
    };
    reader.onerror = () => {
      setPhotoError(t("imageReadError"));
    };
    reader.readAsDataURL(file);
  }

  return (
    <>
      <div className="ks-page-heading">
        <div><h1>{t("cropLog")}</h1><p>{t("cropLogDescription")}</p></div>
        <button type="button" className="ks-primary-button ks-heading-button" onClick={() => openForm()}>＋ {t("addEntry")}</button>
      </div>

      {formOpen && (
        <div className="ks-crop-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <section
            className="ks-entry-form ks-crop-entry-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-entry-modal-title"
            ref={dialogRef}
          >
            <div className="ks-panel-heading">
              <div><p className="ks-eyebrow">{t("fieldNotes").toUpperCase()}</p><h2 id="crop-entry-modal-title">{t("addEntry")}</h2></div>
              <button type="button" className="ks-close-button" onClick={closeForm} aria-label={t("close")} disabled={isSaving}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <fieldset className="ks-crop-type-field">
                <legend>{t("activityType")}</legend>
                <div className="ks-crop-type-chips">
                  {cropActivityTypes.map((type) => (
                    <button
                      type="button"
                      className={`ks-crop-type-chip${selectedType.id === type.id ? " selected" : ""}`}
                      key={type.id}
                      aria-pressed={selectedType.id === type.id}
                      onClick={() => setSelectedType(type)}
                    >
                      <span aria-hidden="true">{type.icon}</span>{type.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="ks-crop-form-label">{t("date")}
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </label>
              <label className="ks-crop-form-label ks-crop-description-label">{t("description")}
                <span className="ks-crop-description-control">
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("descriptionPlaceholder")}
                    rows="4"
                    required
                    maxLength={500}
                  />
                  {speechRecognitionSupported && (
                    <button
                      type="button"
                      className={`ks-voice-button${isListening ? " listening" : ""}`}
                      onClick={handleVoiceInput}
                      aria-label={isListening ? t("stopVoiceInput") : t("startVoiceInput")}
                      aria-pressed={isListening}
                      title={isListening ? t("stopVoiceInput") : t("startVoiceInput")}
                    >🎤</button>
                  )}
                </span>
              </label>
              <label className="ks-photo-field ks-crop-form-label">{t("photo")}
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
                <span>{t("optionalPhoto")}</span>
              </label>
              {photoError && <p className="ks-photo-error" role="alert">{photoError}</p>}
              {photoUrl && <div className="ks-photo-preview"><img src={photoUrl} alt={t("selectedPhotoAlt")} /><button type="button" onClick={() => setPhotoUrl("")}>{t("removePhoto")}</button></div>}
              {saveError && <p className="ks-form-error" role="alert">{saveError}</p>}
              <button type="submit" className="ks-primary-button ks-crop-save-button" disabled={isSaving}>
                {isSaving && <span className="ks-login-spinner" aria-hidden="true" />}
                {isSaving ? t("loading") : t("saveEntry")}
              </button>
            </form>
          </section>
        </div>
      )}

      {toastVisible && <div className="ks-crop-toast" role="status" aria-live="polite">{t("entrySaved")} ✓</div>}

      {entries.length === 0 ? (
        <section className="ks-crop-empty-state" aria-labelledby="crop-empty-title">
          <div className="ks-crop-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <path d="M19 13h22a5 5 0 0 1 5 5v32H20a5 5 0 0 1-5-5V18a5 5 0 0 1 4-5Z" />
              <path d="M22 20h15M22 27h15M22 34h7" />
              <path d="M39 42c0-8 5-13 14-16-1 9-6 14-14 16Zm0 0c-1-5-4-8-8-10" />
            </svg>
          </div>
          <h2 id="crop-empty-title">{t("firstCropEntry")}</h2>
          <p>{t("cropLogEmptyHelp")}</p>
          <button type="button" className="ks-primary-button ks-empty-add-button" onClick={() => openForm()}>＋ {t("addEntry")}</button>
          <div className="ks-crop-quick-add">
            <p>{t("chooseActivityType")}</p>
            <div>
              {cropActivityTypes.map((type) => (
                <button type="button" className="ks-crop-quick-chip" key={type.id} onClick={() => openForm(type)}>
                  <span aria-hidden="true">{type.icon}</span>{t(type.key)}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="ks-crop-timeline" aria-label={t("cropLogTimeline")}>
        {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((entry, index) => {
          const [, month, day] = entry.date.split("-");
          const activityType = getCropActivityType(entry.title);
          const entryTitle = activityType ? t(activityType.key) : entry.title;
          return (
            <article className={`ks-crop-timeline-entry${index === 0 ? " latest" : ""}`} key={entry.id}>
              <div className="ks-crop-date-tile"><span>{new Intl.DateTimeFormat(localeFallbacks[language] || language, { month: "short" }).format(new Date(Number(entry.date.slice(0, 4)), Number(month) - 1, Number(day)))}</span><strong>{Number(day)}</strong></div>
              <span className="ks-crop-timeline-marker" aria-hidden="true" />
              <div className="ks-panel ks-crop-entry-card">
                <div className="ks-crop-entry-topline">
                  <span className={`ks-crop-type-icon ks-crop-type-${activityType?.id || "field"}`} role="img" aria-label={activityType ? t(activityType.key) : t("fieldActivity")}>{activityType?.icon || "🌱"}</span>
                  <span className="ks-crop-date-badge">{formatLogDate(entry.date, language)}</span>
                </div>
                <h2>{t("day")} {entry.day}: {entryTitle}</h2>
                <p className="ks-crop-entry-description">{getEntryText(entry, "description")}</p>
                {entry.photoUrl && <img className="ks-crop-entry-photo" src={entry.photoUrl} alt={`${t("photoFor")} ${getEntryText(entry, "title", t)}`} loading="lazy" />}
              </div>
            </article>
          );
        })}
        </section>
      )}
    </>
  );
}

function AdvisoryCard({ feedback, onFeedback }) {
  const { t } = useLanguage();
  const responses = ["Yes", "Partially", "No"];
  const feedbackTranslationKey = feedback?.answer === "Yes"
    ? "yes"
    : feedback?.answer === "Partially"
      ? "partially"
      : "no";

  return (
    <article className="ks-panel ks-advisory-card">
      <div className="ks-advisory-symbol">✳</div>
      <div className="ks-advisory-copy"><p className="ks-eyebrow">{t("cropCare").toUpperCase()} · 7 {t("daysAgo").toUpperCase()}</p><h2>{t("weSuggested")} {t("sprayNeemOil")}</h2><p>{t("feedbackQuestion")}</p>{feedback && <span className="ks-feedback-confirmation">{t("feedbackThanks")} “{t(feedbackTranslationKey)}”.</span>}</div>
      <div className="ks-feedback-actions">{responses.map((response) => <button key={response} className={feedback?.answer === response ? "selected" : ""} onClick={() => onFeedback(response)} aria-pressed={feedback?.answer === response}>{t(response === "Yes" ? "yes" : response === "Partially" ? "partially" : "no")}</button>)}</div>
    </article>
  );
}

function Advisory({ feedback, onFeedback, weatherState, weatherLocation, onRequestLocation }) {
  const { t } = useLanguage();
  const weatherPresentation = weatherState.current
    ? weatherCodeKeys[weatherState.current.weatherCode] || ["weatherUnavailable", "☁"]
    : ["weatherUnavailable", "☁"];
  return (
    <>
      <div className="ks-page-heading">
        <div>
          <p className="ks-eyebrow">{t("practicalCropCare").toUpperCase()}</p>
          <h1>{t("farmAdvisory")}</h1>
          <p>{t("helpfulCropSuggestions")}</p>
        </div>
        <span className="ks-status-pill">{t("fieldOneLabel")} · {t("growingWell")}</span>
      </div>

      <section className="ks-advisory-grid" aria-label={t("cropRecommendationWeather")}>
        <article className="ks-panel ks-recommendation-panel">
          <div className="ks-advisory-panel-heading">
            <span className="ks-stat-icon">✳</span>
            <span className="ks-status-pill">{t("cropCare").toUpperCase()}</span>
          </div>
          <p className="ks-eyebrow ks-recommendation-age">{t("recommendationAge").toUpperCase()}</p>
          <h2>{t("neemHeadline")}</h2>
          <p className="ks-recommendation-description">
            {t("neemDescription")}
          </p>
          <div className="ks-recommendation-meta">
            <div><span>{t("yourCrop").toUpperCase()}</span><strong>{t("desiTomato")}</strong></div>
            <div><span>{t("fieldLabel").toUpperCase()}</span><strong>{t("fieldOneLabel")} · 2 {t("acres")}</strong></div>
            <div><span>{t("bestTime").toUpperCase()}</span><strong>{t("earlyMorningEvening")}</strong></div>
          </div>
          <p className="ks-safety-note">
            <span aria-hidden="true">ⓘ</span>
            {t("safetyAdvice")}
          </p>
        </article>

        <article className="ks-panel ks-advisory-weather">
          <div className="ks-panel-heading">
            <div><p className="ks-eyebrow">{t("localConditions").toUpperCase()}</p><h2>{t("weatherForField")}</h2></div>
            <span className="ks-stat-icon ks-icon-sun">{weatherState.current ? weatherPresentation[1] : "☀"}</span>
          </div>
          <p className="ks-weather-location">{weatherLocation?.name || t("chooseLocation")}</p>
          {weatherState.status === "loading" ? <p className="ks-weather-loading">{t("gettingLocation")}</p> : weatherState.current ? (
            <div className="ks-advisory-temperature"><strong>{Math.round(weatherState.current.temperature)}°</strong><span>{t(weatherPresentation[0])}</span></div>
          ) : (
            <div className="ks-weather-fallback"><p>{t(weatherState.error || "locationUnavailable")}</p><button type="button" className="ks-secondary-button" onClick={onRequestLocation}>{t("enableLocation")}</button></div>
          )}
          <p className="ks-weather-advice ks-weather-advice-large">✳ &nbsp;{t("weatherAdvice")}</p>
          <div className="ks-advisory-weather-stats">
            <div><span>{t("humidity").toUpperCase()}</span><strong>{weatherState.current ? `${weatherState.current.humidity}%` : "—"}</strong></div>
            <div><span>{t("chanceOfRain").toUpperCase()}</span><strong>{weatherState.current?.rainChance == null ? "—" : `${weatherState.current.rainChance}%`}</strong></div>
          </div>
        </article>
      </section>

      <div className="ks-advisory-section-heading">
        <div><p className="ks-eyebrow">{t("closeTheLoop").toUpperCase()}</p><h2>{t("feedbackPrompt")}</h2></div>
        <span>{t("feedbackHelp").toUpperCase()}</span>
      </div>
      <AdvisoryCard feedback={feedback} onFeedback={onFeedback} />

      <article className="ks-panel ks-advisory-tip">
        <span className="ks-tip-icon">☀</span>
        <div>
          <p className="ks-eyebrow">{t("todayFieldNote").toUpperCase()}</p>
          <h2>{t("walkField")}</h2>
          <p>{t("fieldWalkAdvice")}</p>
        </div>
      </article>
    </>
  );
}

function Traceability({ batches, onAddBatch, farmerName }) {
  const { language, t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [field, setField] = useState("Field 01");
  const [crop, setCrop] = useState("Desi Tomato");
  const [harvestDate, setHarvestDate] = useState(() => formatInputDate(new Date()));
  const [quantity, setQuantity] = useState("");
  const [inputs, setInputs] = useState([{ type: "Fertilizer", name: "", date: "", quantity: "", unit: "kg" }]);
  const [downloadError, setDownloadError] = useState("");

  function addInputRow() {
    setInputs((current) => [...current, { type: "Pesticide", name: "", date: "", quantity: "", unit: "ml" }]);
  }

  function updateInput(index, fieldName, value) {
    setInputs((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [fieldName]: value } : item
    ));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const year = harvestDate.slice(0, 4);
    const nextSequence = batches.reduce((highest, batch) => {
      const match = batch.batchNumber?.match(new RegExp(`^TB-${year}-(\\d+)$`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 13) + 1;
    const batch = {
      id: crypto.randomUUID(),
      batchNumber: `TB-${year}-${String(nextSequence).padStart(3, "0")}`,
      crop,
      cropKey: crop === "Desi Tomato" ? "desiTomato" : "",
      harvestDate,
      field,
      fieldKey: field === "Field 01" ? "fieldOneLabel" : "",
      location: "Nashik, Maharashtra",
      quantity: Number(quantity),
      unit: "kg",
      farmerName,
      inputs: inputs.filter((item) => item.name.trim()).map((item) => ({
        ...item,
        name: item.name.trim(),
        quantity: Number(item.quantity)
      }))
    };
    onAddBatch(batch);
    setFormOpen(false);
    setQuantity("");
    setInputs([{ type: "Fertilizer", name: "", date: "", quantity: "", unit: "kg" }]);
  }

  function downloadQr(batch) {
    const svg = document.getElementById(`qr-${batch.id}`);
    if (!(svg instanceof SVGElement)) {
      setDownloadError(t("qrDownloadError"));
      console.error(`Could not find QR code for ${batch.batchNumber}.`);
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const qrUrl = URL.createObjectURL(new Blob([svgData], { type: "image/svg+xml;charset=utf-8" }));
    const downloadLink = document.createElement("a");
    downloadLink.href = qrUrl;
    downloadLink.download = `${batch.batchNumber}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(qrUrl), 1000);
    setDownloadError("");
  }

  return (
    <>
      <div className="ks-page-heading">
        <div><p className="ks-eyebrow">{t("fieldToFork").toUpperCase()}</p><h1>{t("traceability")}</h1><p>{t("batchListIntro")}</p></div>
        <button type="button" className="ks-primary-button ks-heading-button" onClick={() => setFormOpen((open) => !open)}>＋ {t("createBatch")}</button>
      </div>

      {formOpen && (
        <form className="ks-entry-form ks-batch-form" onSubmit={handleSubmit}>
          <div className="ks-panel-heading"><div><p className="ks-eyebrow">{t("harvestBatch").toUpperCase()}</p><h2>{t("createBatch")}</h2></div><button type="button" className="ks-close-button" onClick={() => setFormOpen(false)} aria-label={t("close")}>×</button></div>
          <div className="ks-form-grid">
            <label>{t("fieldLabel")}<select value={field} onChange={(event) => setField(event.target.value)}><option>Field 01</option><option>Field 02</option></select></label>
            <label>{t("yourCrop")}<select value={crop} onChange={(event) => setCrop(event.target.value)}><option>Desi Tomato</option><option>Green Chilli</option><option>Onion</option></select></label>
            <label>{t("harvestDate")}<input type="date" value={harvestDate} onChange={(event) => setHarvestDate(event.target.value)} required /></label>
            <label>{t("quantity")} ({t("kilos")})<input type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
          </div>
          <div className="ks-batch-inputs">
            <div className="ks-batch-input-heading"><div><p className="ks-eyebrow">{t("inputHistory").toUpperCase()}</p><h3>{t("inputsUsed")}</h3></div><button type="button" className="ks-secondary-button" onClick={addInputRow}>＋ {t("addInput")}</button></div>
            {inputs.map((item, index) => (
              <div className="ks-input-row" key={index}>
                <label>{t("inputType")}<select value={item.type} onChange={(event) => updateInput(index, "type", event.target.value)}><option>Fertilizer</option><option>Pesticide</option></select></label>
                <label>{t("inputName")}<input value={item.name} onChange={(event) => updateInput(index, "name", event.target.value)} placeholder={t("inputNamePlaceholder")} /></label>
                <label>{t("dateApplied")}<input type="date" value={item.date} onChange={(event) => updateInput(index, "date", event.target.value)} required={Boolean(item.name.trim())} /></label>
                <label>{t("amount")}<input type="number" min="0" step="any" value={item.quantity} onChange={(event) => updateInput(index, "quantity", event.target.value)} placeholder="0" required={Boolean(item.name.trim())} /></label>
                <label>{t("unit")}<select value={item.unit} onChange={(event) => updateInput(index, "unit", event.target.value)}><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></label>
              </div>
            ))}
          </div>
          <button type="submit" className="ks-primary-button">{t("createBatch")}</button>
        </form>
      )}

      {downloadError && <p className="ks-form-error" role="alert">{downloadError}</p>}

      <section className="ks-batch-grid" aria-label={t("traceabilityBatches")}>
        {batches.map((batch) => {
          const traceUrl = `${window.location.origin}/trace/${encodeURIComponent(batch.id)}?batch=${encodeURIComponent(JSON.stringify(batch))}`;
          const batchCrop = batch.cropKey ? t(batch.cropKey) : batch.crop;
          const batchField = batch.fieldKey ? t(batch.fieldKey) : batch.field;
          return (
            <article className="ks-panel ks-batch-list-card" key={batch.id}>
              <div className="ks-batch-list-header"><div><p className="ks-eyebrow">{t("harvestBatch").toUpperCase()}</p><h2>{batchCrop}</h2><span>{t("batchNumber")} #{batch.batchNumber}</span></div><span className="ks-status-pill">{t("batchVerified")}</span></div>
              <div className="ks-batch-list-details">
                <div><span>{t("harvestDate").toUpperCase()}</span><strong>{formatLogDate(batch.harvestDate, language)}</strong></div>
                <div><span>{t("fieldLabel").toUpperCase()}</span><strong>{batchField}</strong></div>
                <div><span>{t("quantity").toUpperCase()}</span><strong>{batch.quantity} {batch.unit}</strong></div>
              </div>
              <div className="ks-batch-list-bottom">
                <div className="ks-batch-qr-thumb"><QRCodeSVG id={`qr-${batch.id}`} value={traceUrl} size={86} level="H" includeMargin /></div>
                <div className="ks-batch-actions">
                  <Link to={`/trace/${batch.id}`} className="ks-inline-link">{t("viewPublicPage")} →</Link>
                  <button type="button" className="ks-secondary-button" onClick={() => downloadQr(batch)}>{t("downloadQr")}</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function getPlantHealthLabel(label, t) {
  if (label === "healthy") return t("healthy");
  if (label === "diseased") return t("possibleDisease");
  return label;
}

function TreatmentAdvice() {
  const { t } = useLanguage();
  return <p className="ks-plant-treatment-placeholder">{t("treatmentAdvicePlaceholder")}</p>;
}

function PlantHealth({ today, photos, onAddPhoto }) {
  const { language, t } = useLanguage();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const daysUntilPhoto = getDaysUntilPlantPhoto(today, photos);
  const sortedPhotos = [...photos].sort((a, b) => b.date.localeCompare(a.date));
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId);

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSelectedFile(null);
      setPhotoPreview("");
      setUploadError(t("chooseImage"));
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoPreview(reader.result);
        setUploadError("");
      } else {
        setSelectedFile(null);
        setUploadError(t("imageReadError"));
      }
    };
    reader.onerror = () => {
      setSelectedFile(null);
      setUploadError(t("imageReadError"));
    };
    reader.readAsDataURL(file);
  }

  async function analyzePhoto(event) {
    event.preventDefault();
    if (!selectedFile || isAnalyzing) return;
    setIsAnalyzing(true);
    setUploadError("");
    try {
      const analysis = await analyzePlantPhoto(selectedFile, t);
      const photo = {
        id: crypto.randomUUID(),
        date: formatInputDate(today),
        photoUrl: photoPreview,
        analysis: { ...analysis, disclaimer: t("plantHealthDisclaimer") }
      };
      onAddPhoto(photo);
      setSelectedPhotoId(photo.id);
      setPhotoPreview("");
      setSelectedFile(null);
      setIsUploadOpen(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("plantHealthAnalysisFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  }

  function closeUpload() {
    if (isAnalyzing) return;
    setIsUploadOpen(false);
    setPhotoPreview("");
    setSelectedFile(null);
    setUploadError("");
  }

  return (
    <>
      <div className="ks-page-heading">
        <div><h1>{t("plantHealth")}</h1><p>{t("fieldOneTomato")}</p></div>
      </div>

      <section className="ks-panel ks-plant-due-card">
        <div className="ks-plant-due-copy">
          <span className="ks-stat-icon ks-icon-lime" aria-hidden="true">♧</span>
          <div>
            <p className="ks-eyebrow">{t("nextPhotoDue").toUpperCase()}</p>
            <h2>{daysUntilPhoto === 0 ? t("photoDueNow") : t("photoDueIn").replace("{days}", daysUntilPhoto)}</h2>
            <p>{t("photoCycleDescription")}</p>
          </div>
        </div>
        <button type="button" className="ks-primary-button" onClick={() => setIsUploadOpen(true)}>
          {t("takePhotoNow")}
        </button>
      </section>

      {selectedPhoto && (
        <article className="ks-panel ks-plant-result">
          <div className="ks-panel-heading">
            <div><p className="ks-eyebrow">{t("latestAnalysis").toUpperCase()}</p><h2>{formatLogDate(selectedPhoto.date, language)}</h2></div>
            <span className={`ks-status-pill ${selectedPhoto.analysis.uncertain ? "ks-plant-caution" : "ks-plant-healthy"}`}>
              {selectedPhoto.analysis.uncertain ? t("expertAdviceRequired") : t("latestAnalysis")}
            </span>
          </div>
          <div className="ks-plant-result-body">
            <img src={selectedPhoto.photoUrl} alt={t("plantPhotoAlt")} />
            <div className="ks-plant-result-copy">
              {selectedPhoto.analysis.uncertain ? (
                <>
                  <h3>{t("uncertainAnalysisHeadline")}</h3>
                  <p className="ks-plant-expert-note">{t("takeClearPlantPhoto")}</p>
                </>
              ) : (
                <>
                  <h3>{getPlantHealthLabel(selectedPhoto.analysis.label, t)}</h3>
                  <span className="ks-plant-confidence">{t("confidence")}: {Math.round(selectedPhoto.analysis.confidence * 100)}%</span>
                </>
              )}
              <p>{t("plantHealthDisclaimer")}</p>
              <TreatmentAdvice />
            </div>
          </div>
        </article>
      )}

      <section className="ks-panel ks-plant-timeline">
        <div className="ks-panel-heading">
          <div><p className="ks-eyebrow">{t("fieldOneTomato").toUpperCase()}</p><h2>{t("photoTimeline")}</h2></div>
          <span className="ks-entry-count">{photos.length} {t("photos")}</span>
        </div>
        <div className="ks-plant-timeline-list">
          {sortedPhotos.map((photo) => (
            <article className="ks-plant-timeline-entry" key={photo.id}>
              <button
                type="button"
                className="ks-plant-photo-thumb"
                onClick={() => setSelectedPhotoId(photo.id)}
                aria-label={`${t("viewAnalysis")}: ${formatLogDate(photo.date, language)}`}
              >
                <img src={photo.photoUrl} alt={t("plantPhotoAlt")} loading="lazy" />
              </button>
              <div className="ks-plant-timeline-copy">
                <div className="ks-plant-timeline-top">
                  <strong>{formatLogDate(photo.date, language)}</strong>
                  <span className={`ks-status-pill ${photo.analysis.uncertain ? "ks-plant-caution" : "ks-plant-healthy"}`}>
                    {photo.analysis.uncertain ? t("expertAdviceRequired") : t("latestAnalysis")}
                  </span>
                </div>
                <h3>{photo.analysis.uncertain ? t("uncertainAnalysisShort") : getPlantHealthLabel(photo.analysis.label, t)}</h3>
              </div>
            </article>
          ))}
        </div>
      </section>

      {isUploadOpen && (
        <div
          className="ks-plant-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeUpload();
          }}
        >
          <section className="ks-panel ks-plant-upload-modal" role="dialog" aria-modal="true" aria-labelledby="plant-upload-title">
            <div className="ks-panel-heading">
              <div><p className="ks-eyebrow">{t("fieldOneTomato").toUpperCase()}</p><h2 id="plant-upload-title">{t("addPlantPhoto")}</h2></div>
              <button type="button" className="ks-close-button" onClick={closeUpload} disabled={isAnalyzing} aria-label={t("close")}>×</button>
            </div>
            <form onSubmit={analyzePhoto}>
              <div className="ks-plant-upload-options">
                <label className="ks-plant-upload-option">
                  <span aria-hidden="true">◎</span>{t("takePhoto")}
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
                </label>
                <label className="ks-plant-upload-option">
                  <span aria-hidden="true">▧</span>{t("chooseFromGallery")}
                  <input type="file" accept="image/*" onChange={handlePhotoChange} />
                </label>
              </div>
              {uploadError && <div className="ks-panel ks-plant-error" role="alert">{uploadError}</div>}
              {photoPreview ? (
                <img className="ks-plant-preview" src={photoPreview} alt={t("plantPhotoAlt")} />
              ) : (
                <div className="ks-plant-preview-placeholder"><span aria-hidden="true">♧</span><p>{t("plantPhotoPrompt")}</p></div>
              )}
              <button type="submit" className="ks-primary-button ks-plant-analyze-button" disabled={!photoPreview || isAnalyzing}>
                {isAnalyzing && <span className="ks-login-spinner" aria-hidden="true" />}
                {isAnalyzing ? t("analyzing") : t("analyzePhoto")}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function PublicTracePage({ batches }) {
  const { batchId } = useParams();
  const [searchParams] = useSearchParams();
  const { language, t } = useLanguage();
  const sharedBatch = searchParams.get("batch");
  let batch;
  if (sharedBatch) {
    try {
      const parsedBatch = JSON.parse(sharedBatch);
      if (parsedBatch.id === batchId && Array.isArray(parsedBatch.inputs)) {
        batch = parsedBatch;
      } else {
        console.error("The shared traceability record does not match its batch URL.");
      }
    } catch (error) {
      console.error("Could not read the shared traceability record.", error);
    }
  }
  batch ||= batches.find((item) => item.id === batchId);

  if (!batch) {
    return (
      <main className="ks-public-trace">
        <section className="ks-public-card ks-public-not-found"><span className="ks-brand-icon">B</span><h1>{t("batchNotFound")}</h1><p>{t("batchNotFoundDescription")}</p><Link to="/dashboard" className="ks-inline-link">{t("backToBhoomitra")}</Link></section>
      </main>
    );
  }

  return (
    <main className="ks-public-trace">
      <div className="ks-public-shell">
        <header className="ks-public-header">
          <span className="ks-brand-icon">B</span><span className="ks-public-brand">Bhoomitra</span>
          <span className="ks-public-verified"><span>✓</span>{t("verifiedByBhoomitra")}</span>
        </header>
        <article className="ks-public-card ks-public-origin">
          <p className="ks-eyebrow">{t("batchNumber").toUpperCase()} #{batch.batchNumber}</p>
          <h1>{batch.cropKey ? t(batch.cropKey) : batch.crop}</h1>
          <p className="ks-public-quantity">{batch.quantity} {batch.unit} · {t("freshProduce")}</p>
          <div className="ks-public-facts">
            <div><span>{t("grower").toUpperCase()}</span><strong>{batch.farmerName}</strong></div>
            <div><span>{t("fieldLabel").toUpperCase()}</span><strong>{batch.fieldKey ? t(batch.fieldKey) : batch.field}</strong></div>
            <div><span>{t("location").toUpperCase()}</span><strong>{batch.location}</strong></div>
            <div><span>{t("harvestDate").toUpperCase()}</span><strong>{formatLogDate(batch.harvestDate, language)}</strong></div>
          </div>
        </article>
        <section className="ks-public-card ks-public-history">
          <div className="ks-panel-heading"><div><p className="ks-eyebrow">{t("growingWithCare").toUpperCase()}</p><h2>{t("inputsUsed")}</h2></div><span className="ks-entry-count">{batch.inputs.length} {t("records")}</span></div>
          {batch.inputs.length ? (
            <div className="ks-public-timeline">
              {[...batch.inputs].sort((a, b) => b.date.localeCompare(a.date)).map((item, index) => (
                <article className="ks-public-timeline-item" key={`${item.name}-${item.date}-${index}`}>
                  <span className="ks-public-timeline-marker" aria-hidden="true" />
                  <p className="ks-eyebrow">{formatLogDate(item.date, language)} · {item.type}</p>
                  <h3>{item.nameKey ? t(item.nameKey) : item.name}</h3>
                  <p>{item.quantity} {item.unit}{item.detailKey ? ` · ${t(item.detailKey)}` : ""}</p>
                </article>
              ))}
            </div>
          ) : <p className="ks-public-empty">{t("noInputsRecorded")}</p>}
        </section>
        <footer className="ks-public-footer"><span className="ks-brand-icon">B</span><span>Bhoomitra</span><p>{t("traceFooter")}</p></footer>
      </div>
    </main>
  );
}

export default BhoomitraApp;
