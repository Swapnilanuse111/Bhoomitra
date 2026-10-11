import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import "./bhoomitra.css";
import { languages, translate } from "./localization";

const LanguageContext = createContext({ language: "en", setLanguage: () => {}, t: (key) => key });

function useLanguage() {
  return useContext(LanguageContext);
}

const sowingDate = "2026-09-18";
const sowingTimestamp = Date.parse(`${sowingDate}T00:00:00`);
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

const starterEntries = [
  {
    id: "sowing",
    day: 1,
    date: "2026-09-18",
    title: "Sowing",
    description: "Sowed the main field with healthy tomato seeds.",
    photoUrl: "https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=500&q=80"
  },
  {
    id: "fertilizer",
    day: 15,
    date: "2026-10-02",
    title: "Fertilizer applied",
    description: "Applied organic compost around the young plants to support steady growth.",
    photoUrl: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=500&q=80"
  }
];

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

function loadCropEntries() {
  const storedEntries = readStored("bhoomitra-crop-log", starterEntries);
  return storedEntries.map((entry) => ({
    ...entry,
    title: entry.title || entry.activity || "Field activity",
    description: entry.description || entry.note || "",
    photoUrl: entry.photoUrl || ""
  }));
}

function getEntryText(entry, field, t) {
  const sampleKeys = {
    sowing: { title: "sowing", description: "sowingDescription" },
    fertilizer: { title: "fertilizerApplied", description: "fertilizerDescription" }
  };
  const translationKey = sampleKeys[entry.id]?.[field];
  return translationKey ? t(translationKey) : entry[field];
}

function BhoomitraApp() {
  const [today] = useState(() => new Date());
  const [language, setLanguage] = useState(() => {
    migrateLegacyStorage();
    const savedLanguage = localStorage.getItem("bhoomitra-language");
    return languages.some((item) => item.code === savedLanguage) ? savedLanguage : "en";
  });
  const [entries, setEntries] = useState(loadCropEntries);
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
    localStorage.setItem("bhoomitra-crop-log", JSON.stringify(entries));
  }, [entries]);

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

  function addEntry(entry) {
    setEntries((current) => [entry, ...current]);
  }

  function addBatch(batch) {
    setBatches((current) => [batch, ...current]);
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
    const response = { answer, date: new Date().toISOString() };
    setFeedback(response);
    console.log("Bhoomitra advisory feedback:", response);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: (key) => translate(language, key) }}>
      <Routes>
        <Route index element={<LoginPage />} />
        <Route path="trace/:batchId" element={<PublicTracePage batches={batches} />} />
        <Route element={<FarmerLayout today={today} />}>
          <Route path="dashboard" element={<Dashboard today={today} entries={entries} feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} onSelectLocation={selectWeatherLocation} />} />
          <Route path="crop-log" element={<CropLog today={today} entries={entries} onAddEntry={addEntry} />} />
          <Route path="advisory" element={<Advisory feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} />} />
          <Route path="traceability" element={<Traceability batches={batches} onAddBatch={addBatch} />} />
          <Route path="*" element={<Dashboard today={today} entries={entries} feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} onSelectLocation={selectWeatherLocation} />} />
        </Route>
      </Routes>
    </LanguageContext.Provider>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("Aarav Patil");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    if (isRegistering && password !== confirmPassword) {
      setFormError(t("passwordMismatch"));
      return;
    }
    const farmerName = isRegistering
      ? name.trim()
      : localStorage.getItem("bhoomitra-farmer-name") || email.split("@")[0] || t("farmer");
    localStorage.setItem("bhoomitra-farmer-name", farmerName);
    navigate("/dashboard");
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
        <p className="ks-eyebrow">{t("welcomeFarmer").toUpperCase()}</p>
        <h2>{isRegistering ? t("createAccount") : t("signIn")}</h2>
        <p className="ks-login-description">
          {isRegistering ? t("registerDescription") : t("demoLoginDescription")}
        </p>
        <form onSubmit={handleSubmit} className="ks-login-form">
          {isRegistering && (
            <>
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
            </>
          )}
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
          <label htmlFor="farmer-password">{t("password")}</label>
          <input
            id="farmer-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegistering ? "new-password" : "current-password"}
            minLength={8}
            required
          />
          {isRegistering && (
            <>
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
            </>
          )}
          {formError && <p className="ks-form-error" role="alert">{formError}</p>}
          <button type="submit" className="ks-primary-button">
            {isRegistering ? t("createAccount") : t("signIn")} <span>→</span>
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
        <p className="ks-demo-note"><span /> {t("demoAuthNotice")}</p>
      </section>
    </main>
  );
}

function LanguageSelect({ language, onChange, t }) {
  return (
    <label className="ks-language-select">
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

function FarmerLayout({ today }) {
  const { language, setLanguage, t } = useLanguage();
  const farmerName = localStorage.getItem("bhoomitra-farmer-name") || "Aarav Patil";

  return (
    <div className="ks-app">
      <aside className="ks-sidebar">
        <Link to="/dashboard" className="ks-brand">
          <span className="ks-brand-icon">B</span>Bhoomitra
        </Link>
        <p className="ks-sidebar-label">{t("farmManagement")}</p>
        <nav className="ks-nav" aria-label={t("farmerDashboard")}>
          <NavLink to="/dashboard"><span>⌂</span> {t("overview")}</NavLink>
          <NavLink to="/crop-log"><span>☷</span> {t("cropLog")}</NavLink>
          <NavLink to="/advisory"><span>✳</span> {t("advisory")}</NavLink>
          <NavLink to="/traceability"><span>▦</span> {t("traceability")}</NavLink>
        </nav>
        <div className="ks-sidebar-bottom">
          <div className="ks-user-avatar">{farmerName.charAt(0).toUpperCase()}</div>
          <div className="ks-user-copy"><strong>{farmerName}</strong><span>{t("demoFarmer")}</span></div>
          <Link
            to="/"
            className="ks-logout"
            aria-label={t("signOut")}
            onClick={() => localStorage.removeItem("bhoomitra-farmer-name")}
          >
            ↗
          </Link>
        </div>
      </aside>
      <div className="ks-main">
        <header className="ks-topbar">
          <div>
            <p className="ks-topbar-date">{today.toLocaleDateString(localeFallbacks[language] || language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="ks-topbar-context">{t("fieldsLookingGood")}</p>
          </div>
          <div className="ks-topbar-tools">
            <LanguageSelect language={language} onChange={setLanguage} t={t} />
            <span className="ks-workspace-tag">{t("bhoomitraDemo").toUpperCase()}</span>
          </div>
        </header>
        <main className="ks-content"><Outlet /></main>
      </div>
    </div>
  );
}

function Dashboard({
  today,
  entries,
  feedback,
  onFeedback,
  weatherState,
  weatherLocation,
  onRequestLocation,
  onSelectLocation
}) {
  const { language, t } = useLanguage();
  const daysSinceSowing = Math.max(
    1,
    Math.floor((today.getTime() - sowingTimestamp) / 86400000) + 1
  );

  return (
    <>
      <div className="ks-page-heading">
        <div>
          <p className="ks-eyebrow">{today.toLocaleDateString(localeFallbacks[language] || language, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</p>
          <h1>{t("goodMorning")}, {localStorage.getItem("bhoomitra-farmer-name") || "Aarav"} <span>☀</span></h1>
          <p>{t("dashboardIntro")}</p>
        </div>
        <Link to="/crop-log" className="ks-primary-button ks-heading-button">＋ {t("logFarmActivity")}</Link>
      </div>

      <section className="ks-stat-grid" aria-label={t("farmOverview")}>
        <article className="ks-stat-card ks-crop-stat">
          <div className="ks-stat-top"><span className="ks-stat-icon">♧</span><span className="ks-status-pill">{t("growingWell")}</span></div>
          <p className="ks-stat-label">{t("currentCrop").toUpperCase()}</p>
          <h2>{t("desiTomato")}</h2>
          <p className="ks-stat-foot">{t("fieldOneLabel")} · 2 {t("acres")}</p>
        </article>
        <article className="ks-stat-card">
          <div className="ks-stat-top"><span className="ks-stat-icon ks-icon-lime">◷</span><span className="ks-stat-trend">↗ {t("onTrack")}</span></div>
          <p className="ks-stat-label">{t("daysSinceSowing").toUpperCase()}</p>
          <h2>{daysSinceSowing}<small> {t("days")}</small></h2>
          <p className="ks-stat-foot">{t("sownOn")} {formatLogDate(sowingDate, language)}</p>
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
            <input
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
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => formatInputDate(today));
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    onAddEntry({
      id: crypto.randomUUID(),
      day: Math.max(1, Math.floor((Date.parse(`${date}T00:00:00`) - sowingTimestamp) / 86400000) + 1),
      date,
      title: title.trim(),
      description: description.trim(),
      photoUrl
    });
    setTitle("");
    setDate(formatInputDate(today));
    setDescription("");
    setPhotoUrl("");
    setPhotoError("");
    setFormOpen(false);
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
        <div><h1>{t("cropLog")}</h1><p>{t("fieldOneDesiTomato")}</p></div>
        <button className="ks-primary-button ks-heading-button" onClick={() => setFormOpen((open) => !open)}>＋ {t("addEntry")}</button>
      </div>

      {formOpen && (
        <form className="ks-entry-form" onSubmit={handleSubmit}>
          <div className="ks-panel-heading"><div><p className="ks-eyebrow">{t("fieldNotes").toUpperCase()}</p><h2>{t("addEntry")}</h2></div><button type="button" className="ks-close-button" onClick={() => setFormOpen(false)} aria-label={t("close")}>×</button></div>
          <div className="ks-form-grid">
            <label>{t("entryTitle")}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("exampleFertilizer")} required maxLength={100} /></label>
            <label>{t("date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          </div>
          <label className="ks-note-label">{t("description")}<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("descriptionPlaceholder")} rows="3" required maxLength={500} /></label>
          <label className="ks-photo-field">{t("photo")} <input type="file" accept="image/*" onChange={handlePhotoChange} /><span>{t("optionalPhoto")}</span></label>
          {photoError && <p className="ks-photo-error" role="alert">{photoError}</p>}
          {photoUrl && <div className="ks-photo-preview"><img src={photoUrl} alt={t("selectedPhotoAlt")} /><button type="button" onClick={() => setPhotoUrl("")}>{t("removePhoto")}</button></div>}
          <button type="submit" className="ks-primary-button">{t("saveEntry")}</button>
        </form>
      )}

      <div className="ks-crop-timeline" aria-label={t("cropLogTimeline")}>
        {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => {
          const [, month, day] = entry.date.split("-");
          return (
            <article className="ks-crop-timeline-entry" key={entry.id}>
              <div className="ks-crop-date-tile"><span>{new Intl.DateTimeFormat(localeFallbacks[language] || language, { month: "short" }).format(new Date(Number(entry.date.slice(0, 4)), Number(month) - 1, Number(day)))}</span><strong>{Number(day)}</strong></div>
              <span className="ks-crop-timeline-marker" aria-hidden="true" />
              <div className="ks-panel ks-crop-entry-card">
                <p className="ks-eyebrow">{formatLogDate(entry.date, language)} · {t("fieldOneLabel").toUpperCase()}</p>
                <h2>{t("day")} {entry.day}: {getEntryText(entry, "title", t)}</h2>
                <p className="ks-crop-entry-description">{getEntryText(entry, "description", t)}</p>
                {entry.photoUrl && <img className="ks-crop-entry-photo" src={entry.photoUrl} alt={`${t("photoFor")} ${getEntryText(entry, "title", t)}`} loading="lazy" />}
              </div>
            </article>
          );
        })}
      </div>
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

function Traceability({ batches, onAddBatch }) {
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
    const farmerName = localStorage.getItem("bhoomitra-farmer-name") || "Aarav Patil";
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
