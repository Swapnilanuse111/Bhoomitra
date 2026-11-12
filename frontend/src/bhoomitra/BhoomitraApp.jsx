import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import "./bhoomitra.css";
import { languages, translate } from "./localization";
import AccountSettings from "./AccountSettings.jsx";
import {
  analyzePhoto as analyzePlantPhoto,
  getPhotoSchedule,
  updatePhotoSchedule
} from "../services/plantHealthApi.js";
import {
  createCropLogEntry,
  getCropLog,
  getCurrentUser,
  loginFarmer,
  logoutFarmer,
  registerFarmer,
  restoreCropLogEntry,
  updateCropLogEntry,
  voidCropLogEntry
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
    current: "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code",
    hourly: "relative_humidity_2m,precipitation_probability,weather_code",
    forecast_hours: "48"
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
  const hourly = result.hourly || {};
  const weatherCodes = Array.isArray(hourly.weather_code)
    ? hourly.weather_code.filter(Number.isFinite)
    : [];
  const forecastHumidity = Array.isArray(hourly.relative_humidity_2m)
    ? hourly.relative_humidity_2m.filter(Number.isFinite)
    : [];
  const forecastRainChance = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability.filter(Number.isFinite)
    : [];
  return {
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    rainChance: Number.isFinite(current.precipitation_probability)
      ? current.precipitation_probability
      : null,
    weatherCode: current.weather_code,
    forecast: {
      weatherCodes: weatherCodes.length ? weatherCodes : [current.weather_code],
      humidity: forecastHumidity.length
        ? Math.max(...forecastHumidity)
        : current.relative_humidity_2m,
      rainChance: forecastRainChance.length
        ? Math.max(...forecastRainChance)
        : Number.isFinite(current.precipitation_probability)
          ? current.precipitation_probability
          : null
    }
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

function encodeSharedBatch(batch) {
  const bytes = new TextEncoder().encode(JSON.stringify(batch));
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSharedBatch(value) {
  if (value.startsWith("{")) return JSON.parse(value);

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(paddedBase64), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
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

const cropLogQueueKey = "bhoomitra-pending-crop-log-mutations";
const PHOTO_SCHEDULE_DAYS = 24 * 60 * 60 * 1000;

function photoScheduleCacheKey(ownerEmail, crop) {
  return `bhoomitra-photo-schedule:${encodeURIComponent(ownerEmail.toLowerCase())}:${crop}`;
}

function photoSchedulePendingKey(ownerEmail, crop) {
  return `bhoomitra-photo-schedule-pending:${encodeURIComponent(ownerEmail.toLowerCase())}:${crop}`;
}

function createOfflinePhotoSchedule(schedule, crop, mode, requestedInterval) {
  const intervalDays = mode === "manual"
    ? requestedInterval
    : schedule?.mode === "auto"
      ? schedule.interval_days
      : 5;
  const previousInterval = schedule?.interval_days || 5;
  const previousDue = schedule?.next_due_at ? new Date(schedule.next_due_at) : null;
  const lastPhoto = schedule?.last_photo_at ? new Date(schedule.last_photo_at) : null;
  const nextDue = lastPhoto
    ? new Date(lastPhoto.getTime() + intervalDays * PHOTO_SCHEDULE_DAYS)
    : previousDue
      ? new Date(previousDue.getTime() + (intervalDays - previousInterval) * PHOTO_SCHEDULE_DAYS)
      : new Date(Date.now() + intervalDays * PHOTO_SCHEDULE_DAYS);
  const dueDate = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((dueDate.getTime() - todayDate.getTime()) / PHOTO_SCHEDULE_DAYS);

  return {
    ...schedule,
    crop,
    mode,
    interval_days: intervalDays,
    next_due_at: nextDue.toISOString(),
    days_left: daysLeft,
    status: daysLeft < 0 ? "overdue" : daysLeft === 0 ? "due_today" : "ok",
    reason: mode === "manual" ? "manual" : schedule?.reason || "normal"
  };
}

function showDuePhotoNotification(schedule, t) {
  if (!schedule || !["due_today", "overdue"].includes(schedule.status)) return;
  if (!("Notification" in window) || window.Notification.permission !== "granted") return;
  const dueDate = new Date(schedule.next_due_at).toISOString().slice(0, 10);
  const notificationKey = `bhoomitra-photo-notification:${schedule.crop}:${dueDate}`;
  let alreadyNotified = false;

  try {
    alreadyNotified = localStorage.getItem(notificationKey) === "true";
  } catch (error) {
    console.error("Could not check the photo notification history.", error);
  }
  if (alreadyNotified) return;

  try {
    new window.Notification(t("photoDueNotificationTitle"), {
      body: t("photoDueNotificationBody"),
      tag: notificationKey
    });
  } catch (error) {
    console.error("Could not display the photo reminder notification.", error);
    return;
  }

  try {
    localStorage.setItem(notificationKey, "true");
  } catch (error) {
    console.error("Could not store the photo notification history.", error);
  }
}

function isOfflineRequestError(error) {
  return !navigator.onLine || error instanceof TypeError || error?.cause instanceof TypeError;
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
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() => {
    if (localStorage.getItem("bhoomitra-has-seen-onboarding") === "true") return true;
    return localStorage.getItem("bhoomitra-language") !== null
      && localStorage.getItem("bhoomitra-onboarding-in-progress") !== "true";
  });
  const [showOnboardingAgain, setShowOnboardingAgain] = useState(false);
  const [entries, setEntries] = useState([]);
  const [firstCropEntryDone, setFirstCropEntryDone] = useState(() => localStorage.getItem("bhoomitra-checklist-first-crop") === "true");
  const [firstCropTaskActive, setFirstCropTaskActive] = useState(() => localStorage.getItem("bhoomitra-first-crop-task-active") === "true");
  const [plantPhotoDone, setPlantPhotoDone] = useState(() => localStorage.getItem("bhoomitra-checklist-first-photo") === "true");
  const [advisoryViewed, setAdvisoryViewed] = useState(() => localStorage.getItem("bhoomitra-checklist-advisory") === "true");
  const [cropLogSyncError, setCropLogSyncError] = useState("");
  const pendingQueueSyncRef = useRef(false);
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
  const [plantPhotoSchedule, setPlantPhotoSchedule] = useState(null);
  const [plantPhotoScheduleError, setPlantPhotoScheduleError] = useState("");
  const selectedCrop = readStored("bhoomitra-onboarding-profile", {})?.crop || "pomegranate";
  const activePhotoSchedule = plantPhotoSchedule?.ownerEmail === user?.email
    && plantPhotoSchedule?.crop === selectedCrop
    ? plantPhotoSchedule
    : null;
  const photoWeather = weatherState.current ? {
    weatherCodes: weatherState.current.forecast?.weatherCodes || [weatherState.current.weatherCode],
    humidity: weatherState.current.forecast?.humidity ?? weatherState.current.humidity,
    rainChance: weatherState.current.forecast?.rainChance ?? weatherState.current.rainChance
  } : null;
  const photoWeatherKey = JSON.stringify(photoWeather);

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
        if (cropEntries.length > 0) {
          localStorage.setItem("bhoomitra-checklist-first-crop", "true");
          setFirstCropEntryDone(true);
          setFirstCropTaskActive(false);
        }
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
    if (authStatus !== "authenticated" || !user?.email) return undefined;

    let active = true;
    async function syncQueuedCropLogMutations() {
      if (!navigator.onLine || pendingQueueSyncRef.current) return;
      pendingQueueSyncRef.current = true;
      try {
        let queue = readStored(cropLogQueueKey, []);
        const accountQueue = queue.filter((item) => item.ownerEmail === user.email);
        for (const mutation of accountQueue) {
          if (mutation.action === "edit") {
            await updateCropLogEntry(mutation.entryId, mutation.payload);
          } else if (mutation.action === "void") {
            await voidCropLogEntry(mutation.entryId, mutation.payload.reason);
          } else if (mutation.action === "restore") {
            await restoreCropLogEntry(mutation.entryId);
          }
          queue = queue.filter((item) => item.id !== mutation.id);
          localStorage.setItem(cropLogQueueKey, JSON.stringify(queue));
        }
        if (active && accountQueue.length > 0) {
          setEntries(await getCropLog({ includeVoid: true }));
        }
        if (active) setCropLogSyncError("");
      } catch (error) {
        console.error("Could not sync queued crop log changes.", error);
        if (active) setCropLogSyncError(error.message);
      } finally {
        pendingQueueSyncRef.current = false;
      }
    }

    window.addEventListener("online", syncQueuedCropLogMutations);
    if (navigator.onLine) syncQueuedCropLogMutations();
    return () => {
      active = false;
      window.removeEventListener("online", syncQueuedCropLogMutations);
    };
  }, [authStatus, user?.email]);

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
    if (authStatus !== "authenticated" || !user?.email) return undefined;

    let active = true;
    const weather = photoWeatherKey ? JSON.parse(photoWeatherKey) : null;
    const ownerEmail = user.email;
    const cacheKey = photoScheduleCacheKey(ownerEmail, selectedCrop);
    async function loadPhotoSchedule() {
      if (!navigator.onLine) {
        const cached = readStored(cacheKey, null);
        if (active && cached?.ownerEmail === ownerEmail) setPlantPhotoSchedule(cached);
        setPlantPhotoScheduleError(translate(language, "photoReminderOffline"));
        return;
      }

      const pendingKey = photoSchedulePendingKey(ownerEmail, selectedCrop);
      const pending = readStored(pendingKey, null);
      let pendingSyncError = "";
      if (pending) {
        try {
          const synced = await updatePhotoSchedule({
            crop: selectedCrop,
            weather,
            mode: pending.mode,
            intervalDays: pending.interval_days,
            t: (key) => translate(language, key)
          });
          localStorage.removeItem(pendingKey);
          if (active) {
            const ownedSchedule = { ...synced, ownerEmail };
            setPlantPhotoSchedule(ownedSchedule);
            setPlantPhotoScheduleError("");
            try {
              localStorage.setItem(cacheKey, JSON.stringify(ownedSchedule));
            } catch (error) {
              console.error("Could not cache the synced photo reminder.", error);
            }
          }
        } catch (error) {
          console.error("Could not sync the saved photo reminder.", error);
          pendingSyncError = isOfflineRequestError(error)
            ? translate(language, "photoReminderSyncFailed")
            : error.message;
          if (active) {
            setPlantPhotoScheduleError(pendingSyncError);
          }
          if (isOfflineRequestError(error)) return;
        }
      }

      try {
        const schedule = await getPhotoSchedule({
          crop: selectedCrop,
          weather,
          t: (key) => translate(language, key)
        });
        if (active) {
          const ownedSchedule = { ...schedule, ownerEmail };
          setPlantPhotoSchedule(ownedSchedule);
          setPlantPhotoScheduleError(pendingSyncError);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(ownedSchedule));
          } catch (error) {
            console.error("Could not cache the photo reminder.", error);
          }
        }
      } catch (error) {
        console.error("Could not load the plant photo reminder.", error);
        if (active) {
          setPlantPhotoScheduleError(isOfflineRequestError(error)
            ? translate(language, "photoReminderOffline")
            : error.message);
        }
      }
    }

    function handlePhotoScheduleOffline() {
      setPlantPhotoScheduleError(translate(language, "photoReminderOffline"));
    }

    window.addEventListener("online", loadPhotoSchedule);
    window.addEventListener("offline", handlePhotoScheduleOffline);
    const refreshTimer = window.setInterval(loadPhotoSchedule, 60 * 60 * 1000);
    loadPhotoSchedule();
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("online", loadPhotoSchedule);
      window.removeEventListener("offline", handlePhotoScheduleOffline);
    };
  }, [authStatus, language, selectedCrop, photoWeatherKey, user?.email]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      showDuePhotoNotification(activePhotoSchedule, (key) => translate(language, key));
    }
  }, [activePhotoSchedule, authStatus, language]);

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
    if (hasSeenOnboarding) {
      localStorage.setItem("bhoomitra-has-seen-onboarding", "true");
      localStorage.setItem("bhoomitra-onboarding-complete", "true");
      localStorage.removeItem("bhoomitra-onboarding-in-progress");
    }
  }, [hasSeenOnboarding]);

  async function addEntry(entry) {
    const savedEntry = await createCropLogEntry(entry);
    setEntries((current) => [savedEntry, ...current]);
    localStorage.setItem("bhoomitra-checklist-first-crop", "true");
    localStorage.removeItem("bhoomitra-first-crop-task-active");
    setFirstCropEntryDone(true);
    setFirstCropTaskActive(false);
    return savedEntry;
  }

  function queueCropLogMutation(action, entryId, payload = {}) {
    const queue = readStored(cropLogQueueKey, []);
    const mutation = {
      id: `${Date.now()}-${Math.random()}`,
      ownerEmail: user.email,
      action,
      entryId,
      payload
    };
    localStorage.setItem(cropLogQueueKey, JSON.stringify([...queue, mutation]));
  }

  async function editCropLogEntry(entryId, payload) {
    try {
      const updatedEntry = await updateCropLogEntry(entryId, payload);
      setEntries((current) => current.map((entry) => entry.id === entryId ? updatedEntry : entry));
      return { queued: false };
    } catch (error) {
      if (!isOfflineRequestError(error)) throw error;
      queueCropLogMutation("edit", entryId, payload);
      setEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, ...payload } : entry));
      return { queued: true };
    }
  }

  async function voidCropLogEntryWithQueue(entryId, reason) {
    try {
      const updatedEntry = await voidCropLogEntry(entryId, reason);
      setEntries((current) => current.map((entry) => entry.id === entryId ? updatedEntry : entry));
      return { entry: updatedEntry, queued: false };
    } catch (error) {
      if (!isOfflineRequestError(error)) throw error;
      queueCropLogMutation("void", entryId, { reason });
      const updatedEntry = entries.find((entry) => entry.id === entryId);
      const voidedEntry = { ...updatedEntry, is_void: true, void_reason: reason };
      setEntries((current) => current.map((entry) => entry.id === entryId ? voidedEntry : entry));
      return { entry: voidedEntry, queued: true };
    }
  }

  async function restoreCropLogEntryWithQueue(entryId) {
    try {
      const updatedEntry = await restoreCropLogEntry(entryId);
      setEntries((current) => current.map((entry) => entry.id === entryId ? updatedEntry : entry));
      return { queued: false };
    } catch (error) {
      if (!isOfflineRequestError(error)) throw error;
      queueCropLogMutation("restore", entryId);
      setEntries((current) => current.map((entry) => entry.id === entryId
        ? { ...entry, is_void: false, void_reason: "", voided_at: null }
        : entry));
      return { queued: true };
    }
  }

  async function loadCropLog(includeVoid) {
    const cropEntries = await getCropLog({ includeVoid });
    setEntries(cropEntries);
  }

  function addBatch(batch) {
    setBatches((current) => [batch, ...current]);
  }

  function addPlantPhoto(photo) {
    setPlantPhotos((current) => [photo, ...current]);
    localStorage.setItem("bhoomitra-checklist-first-photo", "true");
    setPlantPhotoDone(true);
  }

  function handlePhotoScheduleChange(schedule) {
    const ownedSchedule = { ...schedule, ownerEmail: user.email };
    setPlantPhotoSchedule(ownedSchedule);
    setPlantPhotoScheduleError("");
    try {
      localStorage.setItem(photoScheduleCacheKey(user.email, schedule.crop), JSON.stringify(ownedSchedule));
    } catch (error) {
      console.error("Could not save the photo reminder on this device.", error);
      setPlantPhotoScheduleError(translate(language, "photoScheduleLocalSaveFailed"));
    }
  }

  function markAdvisoryViewed() {
    localStorage.setItem("bhoomitra-checklist-advisory", "true");
    setAdvisoryViewed(true);
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

  function finishOnboarding(profile) {
    localStorage.setItem("bhoomitra-onboarding-profile", JSON.stringify(profile));
    localStorage.setItem("bhoomitra-has-seen-onboarding", "true");
    localStorage.setItem("bhoomitra-onboarding-complete", "true");
    if (localStorage.getItem("bhoomitra-checklist-first-crop") !== "true") {
      localStorage.setItem("bhoomitra-first-crop-task-active", "true");
      setFirstCropTaskActive(true);
    }
    localStorage.removeItem("bhoomitra-onboarding-in-progress");
    localStorage.removeItem("bhoomitra-onboarding-progress");
    setHasSeenOnboarding(true);
    setShowOnboardingAgain(false);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: (key) => translate(language, key) }}>
      {!hasSeenOnboarding || showOnboardingAgain ? (
        <Onboarding onComplete={finishOnboarding} />
      ) : authStatus === "loading" ? (
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
      ) : (
        <Routes>
          <Route index element={authStatus === "authenticated" ? <Navigate to="/dashboard" replace /> : <LoginPage onAuthenticated={finishSignIn} initialName={readStored("bhoomitra-onboarding-profile", {})?.name || ""} />} />
          <Route path="trace/:batchId" element={<PublicTracePage batches={batches} />} />
          <Route element={authStatus === "authenticated" ? <FarmerLayout today={today} user={user} photoSchedule={activePhotoSchedule} onSignOut={signOut} onAdvisoryViewed={markAdvisoryViewed} /> : <Navigate to="/" replace />}>
            <Route path="dashboard" element={<Dashboard today={today} user={user} entries={entries} feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} onSelectLocation={selectWeatherLocation} daysUntilPlantPhoto={Math.max(0, activePhotoSchedule?.days_left ?? getDaysUntilPlantPhoto(today, plantPhotos))} photoSchedule={activePhotoSchedule} photoScheduleError={plantPhotoScheduleError} firstCropEntryDone={firstCropEntryDone || entries.some((entry) => !entry.is_void)} firstCropTaskActive={firstCropTaskActive} plantPhotoDone={plantPhotoDone || plantPhotos.length > 0} advisoryViewed={advisoryViewed} />} />
            <Route path="crop-log" element={<CropLog today={today} entries={entries} onAddEntry={addEntry} onUpdateEntry={editCropLogEntry} onVoidEntry={voidCropLogEntryWithQueue} onRestoreEntry={restoreCropLogEntryWithQueue} onLoadEntries={loadCropLog} syncError={cropLogSyncError} />} />
            <Route path="advisory" element={<Advisory feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} />} />
            <Route path="plant-health" element={<PlantHealth today={today} photos={plantPhotos} onAddPhoto={addPlantPhoto} crop={selectedCrop} ownerEmail={user?.email || ""} weather={photoWeather} schedule={activePhotoSchedule} scheduleError={plantPhotoScheduleError} onScheduleChange={handlePhotoScheduleChange} />} />
            <Route path="traceability" element={<Traceability batches={batches} onAddBatch={addBatch} farmerName={user?.name || ""} />} />
            <Route path="account-settings" element={<AccountSettings user={user} onUserUpdated={setUser} onSignOut={signOut} onShowTutorial={() => setShowOnboardingAgain(true)} language={language} setLanguage={setLanguage} t={(key) => translate(language, key)} />} />
            <Route path="*" element={<Dashboard today={today} user={user} entries={entries} feedback={feedback} onFeedback={saveFeedback} weatherState={weatherState} weatherLocation={weatherLocation} onRequestLocation={requestWeatherLocation} onSelectLocation={selectWeatherLocation} daysUntilPlantPhoto={Math.max(0, activePhotoSchedule?.days_left ?? getDaysUntilPlantPhoto(today, plantPhotos))} photoSchedule={activePhotoSchedule} photoScheduleError={plantPhotoScheduleError} firstCropEntryDone={firstCropEntryDone || entries.some((entry) => !entry.is_void)} firstCropTaskActive={firstCropTaskActive} plantPhotoDone={plantPhotoDone || plantPhotos.length > 0} advisoryViewed={advisoryViewed} />} />
          </Route>
          <Route path="*" element={<Navigate to={authStatus === "authenticated" ? "/dashboard" : "/"} replace />} />
        </Routes>
      )}
    </LanguageContext.Provider>
  );
}

function Onboarding({ onComplete }) {
  const { language, setLanguage, t } = useLanguage();
  const [stage, setStage] = useState(() => readStored("bhoomitra-onboarding-progress", {})?.stage || "language");
  const [profile, setProfile] = useState(() => readStored("bhoomitra-onboarding-profile", {
    name: "",
    village: "",
    crop: "pomegranate"
  }));
  const [locationMessage, setLocationMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    localStorage.setItem("bhoomitra-onboarding-in-progress", "true");
    localStorage.setItem("bhoomitra-onboarding-progress", JSON.stringify({ stage }));
  }, [stage]);

  function updateProfile(field, value) {
    const updatedProfile = { ...profile, [field]: value };
    setProfile(updatedProfile);
    localStorage.setItem("bhoomitra-onboarding-profile", JSON.stringify(updatedProfile));
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setLocationMessage(t("locationUnavailable"));
      return;
    }
    setIsLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const village = await reverseGeocode(coords.latitude, coords.longitude);
        updateProfile("village", village);
        setLocationMessage(village ? t("villageLocationFound") : t("villageEnterManually"));
      } catch {
        setLocationMessage(t("villageEnterManually"));
      } finally {
        setIsLocating(false);
      }
    }, () => {
      setIsLocating(false);
      setLocationMessage(t("villageEnterManually"));
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function listenToWelcome() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const welcome = new window.SpeechSynthesisUtterance(t("onboardingWelcomeSentence"));
    welcome.lang = language === "mr" ? "mr-IN" : "en-IN";
    window.speechSynthesis.speak(welcome);
  }

  return (
    <main className="ks-onboarding">
      <section className="ks-onboarding-card ks-onboarding-welcome" aria-live="polite">
        <HelpButton pageKey="helpOnboarding" />
        <span className="ks-brand ks-onboarding-brand"><span className="ks-brand-icon">B</span>Bhoomitra</span>
        <p className="ks-eyebrow">{t(`onboardingStep${stage[0].toUpperCase()}${stage.slice(1)}`)}</p>
        {stage === "language" && (
          <>
            <h1>{t("onboardingChooseLanguage")}</h1>
            <div className="ks-onboarding-language-options" role="group" aria-label={t("onboardingChooseLanguage")}>
              {[{ code: "mr", key: "languageMarathi" }, { code: "en", key: "languageEnglish" }].map((item) => (
                <button type="button" key={item.code} className={language === item.code ? "selected" : ""} aria-pressed={language === item.code} onClick={() => setLanguage(item.code)}>
                  <span>{t(item.key)}</span>{language === item.code && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
        {stage === "welcome" && (
          <>
            <div className="ks-onboarding-language-icon" aria-hidden="true">♧</div>
            <h1>{t("onboardingWelcomeSentence")}</h1>
            <button type="button" className="ks-secondary-button ks-onboarding-listen" onClick={listenToWelcome}>🔊 {t("listen")}</button>
          </>
        )}
        {stage === "profile" && (
          <form className="ks-onboarding-profile" onSubmit={(event) => { event.preventDefault(); setStage("firstTask"); }}>
            <h1>{t("onboardingProfileTitle")}</h1>
            <label>{t("yourName")}<input value={profile.name} onChange={(event) => updateProfile("name", event.target.value)} maxLength={80} required /></label>
            <label>{t("villageName")}<input value={profile.village} onChange={(event) => updateProfile("village", event.target.value)} /></label>
            <button type="button" className="ks-secondary-button ks-location-button" onClick={useDeviceLocation} disabled={isLocating}>
              {isLocating ? t("gettingLocation") : t("useMyLocation")}
            </button>
            {locationMessage && <p className="ks-onboarding-location-message" role="status">{locationMessage}</p>}
            <fieldset>
              <legend>{t("mainCrop")}</legend>
              <div className="ks-onboarding-crop-options">
                {[
                  { id: "pomegranate", icon: "🍎", key: "cropPomegranate" },
                  { id: "tomato", icon: "🍅", key: "cropTomato" },
                  { id: "cotton", icon: "☁️", key: "cropCotton" },
                  { id: "onion", icon: "🧅", key: "cropOnion" }
                ].map((crop) => (
                  <button type="button" key={crop.id} className={profile.crop === crop.id ? "selected" : ""} aria-pressed={profile.crop === crop.id} onClick={() => updateProfile("crop", crop.id)}>
                    <span aria-hidden="true">{crop.icon}</span><strong>{t(crop.key)}</strong>
                  </button>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="ks-primary-button ks-onboarding-next">{t("next")}</button>
          </form>
        )}
        {stage === "firstTask" && (
          <div className="ks-onboarding-first-task">
            <div className="ks-onboarding-language-icon" aria-hidden="true">☷</div>
            <h1>{t("onboardingFirstTaskTitle")}</h1>
            <p>{t("onboardingFirstTaskHelp")}</p>
            <button type="button" className="ks-primary-button ks-onboarding-next" onClick={() => onComplete(profile)}>{t("onboardingFirstTaskAction")}</button>
          </div>
        )}
        {stage !== "profile" && (
          <div className="ks-onboarding-actions">
            {stage !== "language" && <button type="button" className="ks-onboarding-skip" onClick={() => setStage(stage === "firstTask" ? "profile" : stage === "profile" ? "welcome" : "language")}>{t("back")}</button>}
            {stage !== "firstTask" && <button type="button" className="ks-primary-button" onClick={() => setStage(stage === "language" ? "welcome" : stage === "welcome" ? "profile" : "firstTask")}>{t("next")}</button>}
          </div>
        )}
      </section>
    </main>
  );
}

function LoginPage({ onAuthenticated, initialName = "" }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState(initialName);
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
        <div className="ks-login-hero-brand">
          <img src="/bhoomitra.svg" alt="" />
          <span>Bhoomitra</span>
        </div>
        <div className="ks-login-hero-body">
          <div className="ks-login-art-copy">
            <span className="ks-eyebrow">{t("loginHeroEyebrow")}</span>
            <h1>{t("loginHeroHeadline")}</h1>
            <p>{t("loginHeroSubheading")}</p>
          </div>
          <div className="ks-login-features">
            {[
              { icon: "field", title: "loginFeatureFarmTitle", description: "loginFeatureFarmDescription" },
              { icon: "health", title: "loginFeatureHealthTitle", description: "loginFeatureHealthDescription" },
              { icon: "notes", title: "loginFeatureNotesTitle", description: "loginFeatureNotesDescription" }
            ].map((feature) => (
              <article className="ks-login-feature" key={feature.icon}>
                <span className="ks-login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    {feature.icon === "field" ? (
                      <>
                        <path d="M12 20v-8" />
                        <path d="M12 13c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7Z" />
                        <path d="M12 16c0-4 2.2-6 7-6 0 4.5-2.5 6-7 6Z" />
                      </>
                    ) : feature.icon === "health" ? (
                      <>
                        <path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.3-7 9-4.2-1.7-7-4.8-7-9V6l7-2.5Z" />
                        <path d="m9 12 2 2 4-4" />
                      </>
                    ) : (
                      <>
                        <path d="M7 4.5h8l3 3V20H7z" />
                        <path d="M15 4.5v4h3M10 12h5M10 15.5h5" />
                      </>
                    )}
                  </svg>
                </span>
                <span className="ks-login-feature-copy">
                  <strong>{t(feature.title)}</strong>
                  <span>{t(feature.description)}</span>
                </span>
              </article>
            ))}
          </div>
        </div>
        <span className="ks-art-caption">{t("loginHeroFooter")}</span>
      </div>
      <section className="ks-login-card">
        <div className="ks-login-header">
          <div className="ks-login-brand"><img src="/bhoomitra.svg" alt="" /><span>Bhoomitra</span></div>
          <div className="ks-login-language"><LanguageSelect language={language} onChange={setLanguage} t={t} /><HelpButton pageKey="helpLogin" /></div>
        </div>
        <span className="ks-back-link">{t("workspace")}</span>
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
            <div className="ks-login-input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <path d="m4.5 7 7.5 6 7.5-6" />
              </svg>
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
          </div>
          <div className="ks-login-field">
            <label htmlFor="farmer-password">{t("password")}</label>
            <div className="ks-password-input">
              <svg className="ks-login-password-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2" />
              </svg>
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
          <button type="submit" className="ks-primary-button" disabled={isSubmitting} aria-busy={isSubmitting}>
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

function HelpButton({ pageKey }) {
  const { language, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const activeUtteranceRef = useRef(null);
  const speechStartTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    window.speechSynthesis?.getVoices();
  }, [isOpen]);

  useEffect(() => () => {
    window.clearTimeout(speechStartTimeoutRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  function stopSpeaking() {
    window.clearTimeout(speechStartTimeoutRef.current);
    activeUtteranceRef.current = null;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }

  function listen() {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setSpeechError(t("speechUnavailable"));
      return;
    }

    setSpeechError("");
    const synthesis = window.speechSynthesis;
    const message = new window.SpeechSynthesisUtterance(t(pageKey));
    const locale = { mr: "mr-IN", hi: "hi-IN", en: "en-IN" }[language] || language;
    const voices = synthesis.getVoices();
    const normalizedLocale = locale.toLowerCase();
    const matchingVoice = voices.find((voice) => voice.lang.toLowerCase().replaceAll("_", "-") === normalizedLocale)
      || voices.find((voice) => voice.lang.toLowerCase().replaceAll("_", "-").startsWith(`${normalizedLocale.split("-")[0]}-`));

    message.lang = locale;
    if (matchingVoice) message.voice = matchingVoice;
    message.rate = 0.9;
    message.volume = 1;
    message.onstart = () => {
      if (activeUtteranceRef.current !== message) return;
      window.clearTimeout(speechStartTimeoutRef.current);
      setIsSpeaking(true);
    };
    message.onend = () => {
      if (activeUtteranceRef.current !== message) return;
      window.clearTimeout(speechStartTimeoutRef.current);
      activeUtteranceRef.current = null;
      setIsSpeaking(false);
    };
    message.onerror = (event) => {
      if (activeUtteranceRef.current !== message) return;
      window.clearTimeout(speechStartTimeoutRef.current);
      activeUtteranceRef.current = null;
      setIsSpeaking(false);
      if (event.error === "canceled" || event.error === "interrupted") return;
      setSpeechError(t(event.error === "not-allowed" ? "speechPermissionDenied" : "speechPlaybackFailed"));
    };

    try {
      synthesis.cancel();
      synthesis.resume();
      activeUtteranceRef.current = message;
      setIsSpeaking(true);
      synthesis.speak(message);
      speechStartTimeoutRef.current = window.setTimeout(() => {
        if (activeUtteranceRef.current !== message) return;
        activeUtteranceRef.current = null;
        synthesis.cancel();
        setIsSpeaking(false);
        setSpeechError(t("speechPlaybackFailed"));
      }, 5000);
    } catch (error) {
      activeUtteranceRef.current = null;
      setIsSpeaking(false);
      setSpeechError(t("speechPlaybackFailed"));
      console.error("Could not start spoken help.", error);
    }
  }

  function close() {
    stopSpeaking();
    setIsOpen(false);
  }

  return (
    <>
      <button type="button" className="ks-help-button" aria-label={t("helpTitle")} title={t("helpTitle")} onClick={() => setIsOpen(true)}>?</button>
      {isOpen && (
        <div className="ks-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="ks-help-dialog" role="dialog" aria-modal="true" aria-labelledby="ks-help-title">
            <div className="ks-panel-heading"><h2 id="ks-help-title">{t("helpTitle")}</h2><button type="button" className="ks-close-button" aria-label={t("close")} onClick={close}>×</button></div>
            <p>{t(pageKey)}</p>
            {speechError && <p className="ks-form-error" role="status">{speechError}</p>}
            <button type="button" className="ks-primary-button" onClick={listen} aria-pressed={isSpeaking}>
              {isSpeaking ? `⏹ ${t("stopListening")}` : `🔊 ${t("listen")}`}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
function PageEmptyState({ title, description, action, to, onAction }) {
  return (
    <div className="ks-page-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {to
        ? <Link to={to} className="ks-primary-button">{action}</Link>
        : <button type="button" className="ks-primary-button" onClick={onAction}>{action}</button>}
    </div>
  );
}

function FarmerNavIcon({ name }) {
  const paths = {
    overview: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    cropLog: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8 9h8M8 13h8M8 17h5" /></>,
    advisory: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.4Z" /><path d="M8 12h8M8 15h5" /></>,
    plantHealth: <><path d="M20 4c-8 0-14 3.5-14 10a6 6 0 0 0 6 6c6.5 0 8-8 8-16Z" /><path d="M4 21c3-5 7-8 12-11" /></>,
    traceability: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v2M14 20h2M19 19v2M21 21h-2" /></>
  };

  return (
    <svg className="ks-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function FarmerLayout({ today, user, photoSchedule, onSignOut, onAdvisoryViewed }) {
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const [signOutError, setSignOutError] = useState("");
  const farmerName = user.name;
  const helpKeyByPath = {
    "/dashboard": "helpDashboard",
    "/crop-log": "helpCropLog",
    "/plant-health": "helpPlantHealth",
    "/advisory": "helpAdvisory",
    "/traceability": "helpTraceability",
    "/account-settings": "helpSettings"
  };

  useEffect(() => {
    if (location.pathname === "/advisory") onAdvisoryViewed();
  }, [location.pathname, onAdvisoryViewed]);

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
          <NavLink to="/dashboard" data-tour-target="overview"><FarmerNavIcon name="overview" /><span className="ks-nav-label">{t("overview")}</span><span className="ks-nav-label-short">{t("navOverviewShort")}</span></NavLink>
          <NavLink to="/crop-log" data-tour-target="crop-log"><FarmerNavIcon name="cropLog" /><span className="ks-nav-label">{t("cropLog")}</span><span className="ks-nav-label-short">{t("navCropLogShort")}</span></NavLink>
          <NavLink to="/advisory"><FarmerNavIcon name="advisory" /><span className="ks-nav-label">{t("advisory")}</span><span className="ks-nav-label-short">{t("navAdvisoryShort")}</span></NavLink>
          <NavLink to="/plant-health" data-tour-target="plant-health"><FarmerNavIcon name="plantHealth" /><span className="ks-nav-label">{t("plantHealth")}</span><span className="ks-nav-label-short">{t("navPlantHealthShort")}</span></NavLink>
          <NavLink to="/traceability" data-tour-target="traceability"><FarmerNavIcon name="traceability" /><span className="ks-nav-label">{t("traceability")}</span><span className="ks-nav-label-short">{t("navTraceabilityShort")}</span></NavLink>
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
          <Link to="/dashboard" className="ks-mobile-brand">
            <span className="ks-brand-icon">B</span><span>Bhoomitra</span>
          </Link>
          <div className="ks-topbar-copy">
            <p className="ks-topbar-date">{today.toLocaleDateString(localeFallbacks[language] || language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="ks-topbar-context">{t("fieldsLookingGood")}</p>
          </div>
          <div className="ks-topbar-tools">
            <button type="button" className="ks-mobile-logout" aria-label={t("signOut")} onClick={handleSignOut}>↗</button>
            <Link to="/account-settings" className="ks-settings-link" aria-label={t("accountSettings")} title={t("accountSettings")}>⚙</Link>
            <LanguageSelect language={language} onChange={setLanguage} t={t} />
            <HelpButton pageKey={helpKeyByPath[location.pathname] || "helpDashboard"} />
            <Link to="/account-settings" className="ks-mobile-profile" aria-label={t("accountSettings")} title={t("accountSettings")}>
              {user.avatarData ? <img src={user.avatarData} alt="" /> : farmerName.trim().charAt(0).toUpperCase()}
            </Link>
            <span className="ks-workspace-tag">BHOOMITRA</span>
          </div>
        </header>
        <main className="ks-content">
          {photoSchedule && ["due_today", "overdue"].includes(photoSchedule.status)
            && !["/dashboard", "/plant-health"].includes(location.pathname) && (
              <Link
                to="/plant-health"
                state={{ openPlantPhotoUpload: true }}
                className={`ks-photo-due-notice is-${photoSchedule.status}`}
                aria-live="polite"
              >
                <span><strong>{t(photoSchedule.status === "overdue" ? "photoReminderOverdue" : "photoReminderDueToday")}</strong><small>{t("photoDueBannerDescription")}</small></span>
                <span>{t("takePhoto")} →</span>
              </Link>
            )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PhotoReminderCard({ schedule, error, t, children }) {
  const status = schedule?.status || "loading";
  const days = schedule?.days_left ?? 0;
  const title = status === "overdue"
    ? t("photoReminderOverdue")
    : status === "due_today"
      ? t("photoReminderDueToday")
      : status === "ok"
        ? t("photoReminderIn").replace("{days}", days)
        : t("photoReminderLoading");
  const reason = schedule
    ? t(`photoScheduleReason_${schedule.reason}`).replace("{days}", schedule.interval_days)
    : "";

  return (
    <section className={`ks-photo-reminder-card is-${status}`} aria-live="polite">
      <div className="ks-photo-reminder-copy">
        <p className="ks-eyebrow">{t("photoReminderTitle").toUpperCase()}</p>
        <h2>{title}</h2>
        {reason && <p>{reason}</p>}
        {error && <p className="ks-photo-reminder-error" role="status">{error}</p>}
      </div>
      <div className="ks-photo-reminder-actions">{children}</div>
    </section>
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
  daysUntilPlantPhoto,
  photoSchedule,
  photoScheduleError,
  firstCropEntryDone,
  firstCropTaskActive,
  plantPhotoDone,
  advisoryViewed
}) {
  const { language, t } = useLanguage();
  const recentEntry = entries[0];
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const suggestedTask = !firstCropEntryDone
    ? { title: t("onboardingFirstTaskTitle"), description: t("onboardingFirstTaskHelp"), to: "/crop-log" }
    : daysUntilPlantPhoto === 0
      ? { title: t("plantPhotoDue"), description: t("plantPhotoDueDescription"), to: "/plant-health" }
      : { title: t("checkTomatoPlants"), description: t("inspectSoil"), to: "/plant-health" };

  return (
    <>
      <div className="ks-page-heading">
        <div>
          <h1>{t("goodMorning")}, {firstName}</h1>
          <p className="ks-dashboard-date">{today.toLocaleDateString(localeFallbacks[language] || language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Link to="/crop-log" className="ks-primary-button ks-heading-button">＋ {t("logFarmActivity")}</Link>
      </div>
      <article className="ks-stat-card ks-overview-weather">
        <WeatherCard
          weatherState={weatherState}
          weatherLocation={weatherLocation}
          onRequestLocation={onRequestLocation}
          onSelectLocation={onSelectLocation}
        />
      </article>
      <PhotoReminderCard schedule={photoSchedule} error={photoScheduleError} t={t}>
        <Link
          to="/plant-health"
          state={{ openPlantPhotoUpload: true }}
          className="ks-primary-button"
        >
          {t("takePhoto")}
        </Link>
      </PhotoReminderCard>
      <Link to={suggestedTask.to} className="ks-overview-task">
        <span className="ks-overview-task-icon" aria-hidden="true">✓</span>
        <span><span className="ks-eyebrow">{t("todaySuggestedTask")}</span><strong>{suggestedTask.title}</strong><span>{suggestedTask.description}</span></span>
        <span className="ks-overview-task-arrow" aria-hidden="true">→</span>
      </Link>

      {firstCropTaskActive && !firstCropEntryDone && (
        <section className="ks-first-task-guidance" aria-labelledby="first-task-title">
          <div><p className="ks-eyebrow">{t("firstTaskLabel")}</p><h2 id="first-task-title">{t("onboardingFirstTaskTitle")}</h2><p>{t("onboardingFirstTaskHelp")}</p></div>
          <Link to="/crop-log" className="ks-primary-button ks-first-task-action">{t("onboardingFirstTaskAction")}</Link>
        </section>
      )}

      <section className="ks-dashboard-checklist" aria-labelledby="checklist-title">
        <div className="ks-panel-heading"><div><p className="ks-eyebrow">{t("gettingStarted")}</p><h2 id="checklist-title">{t("farmerChecklist")}</h2></div></div>
        <div className="ks-checklist-items">
          {[
            { done: firstCropEntryDone, label: "checklistFirstEntry", to: "/crop-log" },
            { done: plantPhotoDone, label: "checklistFirstPhoto", to: "/plant-health" },
            { done: advisoryViewed, label: "checklistAdvisory", to: "/advisory" }
          ].map((item) => (
            <Link to={item.to} className={`ks-checklist-item${item.done ? " complete" : ""}`} key={item.label} aria-current={item.done ? "step" : undefined}>
              <span className="ks-checklist-mark" aria-hidden="true">{item.done ? "✓" : "○"}</span><span>{t(item.label)}</span>
            </Link>
          ))}
        </div>
      </section>

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
          {entries.length === 0 ? (
            <PageEmptyState title={t("noActivitiesYet")} description={t("cropLogEmptyMessage")} action={t("addEntry")} to="/crop-log" />
          ) : entries.slice(0, 2).map((entry) => (
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

function CropLog({ today, entries, onAddEntry, onUpdateEntry, onVoidEntry, onRestoreEntry, onLoadEntries, syncError }) {
  const { language, t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedType, setSelectedType] = useState(cropActivityTypes[0]);
  const [date, setDate] = useState(() => formatInputDate(today));
  const [entryTitle, setEntryTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessageKey, setToastMessageKey] = useState("entrySaved");
  const [voidToastEntryId, setVoidToastEntryId] = useState(null);
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
    setEditingEntry(null);
    setSelectedType(type);
    setDate(formatInputDate(today));
    setEntryTitle(t(type.key));
    setDescription("");
    setPhotoUrl("");
    setPhotoError("");
    setSaveError("");
    setFormOpen(true);
  }

  function openEditForm(entry) {
    const detectedType = getCropActivityType(entry.title);
    setEditingEntry(entry);
    setSelectedType(cropActivityTypes.find((type) => type.id === detectedType?.id) || cropActivityTypes[0]);
    setDate(entry.date);
    setEntryTitle(entry.title);
    setDescription(entry.description);
    setPhotoUrl(entry.photoUrl || "");
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
    const isFirstOnboardingEntry = !editingEntry
      && localStorage.getItem("bhoomitra-first-crop-task-active") === "true";
    setIsSaving(true);
    setSaveError("");
    try {
      const result = editingEntry
        ? await onUpdateEntry(editingEntry.id, {
          date,
          title: entryTitle,
          description: description.trim(),
          photoUrl
        })
        : await onAddEntry({
          day: entries.filter((entry) => !entry.is_void).length + 1,
          date,
          title: entryTitle,
          description: description.trim(),
          photoUrl
        });
      if (result?.queued) setSyncNotice(t("offlineSyncNotice"));
      setFormOpen(false);
      setToastMessageKey(editingEntry ? "entryUpdated" : "entrySaved");
        setToastMessageKey(isFirstOnboardingEntry ? "firstCropSuccess" : editingEntry ? "entryUpdated" : "entrySaved");
      setVoidToastEntryId(null);
      setToastVisible(true);
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = window.setTimeout(() => setToastVisible(false), 3200);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoidEntry() {
    if (!voidTarget) return;
    setActionError("");
    try {
      const result = await onVoidEntry(voidTarget.id, voidReason.trim());
      if (result.queued) setSyncNotice(t("offlineSyncNotice"));
      setVoidTarget(null);
      setToastMessageKey("voidedToast");
      setVoidToastEntryId(voidTarget.id);
      setToastVisible(true);
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = window.setTimeout(() => {
        setToastVisible(false);
        setVoidToastEntryId(null);
      }, 8000);
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function handleRestoreEntry(entryId, fromToast = false) {
    setActionError("");
    try {
      const result = await onRestoreEntry(entryId);
      if (result.queued) setSyncNotice(t("offlineSyncNotice"));
      if (fromToast) {
        window.clearTimeout(toastTimeoutRef.current);
        setToastMessageKey("entryRestored");
        setVoidToastEntryId(null);
        setToastVisible(true);
        toastTimeoutRef.current = window.setTimeout(() => setToastVisible(false), 3200);
      }
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function handleShowVoided(event) {
    const includeVoid = event.target.checked;
    setShowVoided(includeVoid);
    setActionError("");
    try {
      await onLoadEntries(includeVoid);
    } catch (error) {
      setActionError(error.message);
      setShowVoided(!includeVoid);
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

  const visibleEntries = showVoided ? entries : entries.filter((entry) => !entry.is_void);

  return (
    <>
      <div className="ks-page-heading">
        <div><h1>{t("cropLog")}</h1><p>{t("cropLogDescription")}</p></div>
        <button type="button" className="ks-primary-button ks-heading-button" onClick={() => openForm()}>＋ {t("addEntry")}</button>
      </div>
      <label className="ks-void-toggle">
        <input type="checkbox" checked={showVoided} onChange={handleShowVoided} />
        <span>{t("showVoidedEntries")}</span>
      </label>
      {syncNotice && <p className="ks-offline-notice" role="status">{syncNotice}</p>}
      {syncError && <p className="ks-form-error ks-crop-action-error" role="alert">{syncError}</p>}
      {actionError && <p className="ks-form-error ks-crop-action-error" role="alert">{actionError}</p>}

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
              <div><p className="ks-eyebrow">{t("fieldNotes").toUpperCase()}</p><h2 id="crop-entry-modal-title">{editingEntry ? t("editEntry") : t("addEntry")}</h2></div>
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
                      onClick={() => {
                        setSelectedType(type);
                        setEntryTitle(t(type.key));
                      }}
                    >
                      <span aria-hidden="true">{type.icon}</span>{t(type.key)}
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
                {isSaving ? t("loading") : editingEntry ? t("saveChanges") : t("saveEntry")}
              </button>
            </form>
          </section>
        </div>
      )}

      {voidTarget && (
        <div className="ks-crop-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setVoidTarget(null);
        }}>
          <section className="ks-entry-form ks-void-dialog" role="dialog" aria-modal="true" aria-labelledby="void-entry-title">
            <h2 id="void-entry-title">{t("voidEntryQuestion")}</h2>
            <label className="ks-crop-form-label">{t("voidReason")}
              <textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows="3" maxLength={1000} />
            </label>
            {actionError && <p className="ks-form-error" role="alert">{actionError}</p>}
            <div className="ks-void-dialog-actions">
              <button type="button" className="ks-secondary-button" onClick={() => setVoidTarget(null)}>{t("cancel")}</button>
              <button type="button" className="ks-primary-button" onClick={handleVoidEntry}>{t("confirmVoid")}</button>
            </div>
          </section>
        </div>
      )}

      {toastVisible && (
        <div className="ks-crop-toast" role="status" aria-live="polite">
          <span>{t(toastMessageKey)}{toastMessageKey !== "voidedToast" ? " ✓" : ""}</span>
          {voidToastEntryId && <button type="button" className="ks-toast-undo" onClick={() => handleRestoreEntry(voidToastEntryId, true)}>{t("undo")}</button>}
        </div>
      )}

      {visibleEntries.length === 0 ? (
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
                    <p>{t("cropLogEmptyMessage")}</p>
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
        {[...visibleEntries].sort((a, b) => b.date.localeCompare(a.date)).map((entry, index) => {
          const [, month, day] = entry.date.split("-");
          const activityType = getCropActivityType(entry.title);
          const entryTitle = activityType ? t(activityType.key) : entry.title;
          return (
            <article className={`ks-crop-timeline-entry${index === 0 ? " latest" : ""}${entry.is_void ? " voided" : ""}`} key={entry.id}>
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
                {entry.is_void ? (
                  <>
                    <p className="ks-void-reason"><strong>{t("voidReason")}:</strong> {entry.void_reason || t("noVoidReason")}</p>
                    <button type="button" className="ks-secondary-button ks-crop-action-button" onClick={() => handleRestoreEntry(entry.id)}>{t("restoreEntry")}</button>
                  </>
                ) : (
                  <div className="ks-crop-entry-actions">
                    <button type="button" className="ks-secondary-button ks-crop-action-button" onClick={() => openEditForm(entry)}>{t("editEntry")}</button>
                    <button type="button" className="ks-secondary-button ks-crop-action-button" onClick={() => {
                      setActionError("");
                      setVoidReason("");
                      setVoidTarget(entry);
                    }}>{t("voidEntry")}</button>
                  </div>
                )}
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
        {batches.length === 0 ? (
          <PageEmptyState title={t("batchesEmptyTitle")} description={t("batchesEmptyMessage")} action={t("createBatch")} onAction={() => setFormOpen(true)} />
        ) : batches.map((batch) => {
          const traceUrl = `${window.location.origin}/trace/${encodeURIComponent(batch.id)}?batch=${encodeSharedBatch(batch)}`;
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

function PlantHealth({
  today,
  photos,
  onAddPhoto,
  crop,
  ownerEmail,
  weather,
  schedule,
  scheduleError,
  onScheduleChange
}) {
  const { language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [isUploadOpen, setIsUploadOpen] = useState(() => Boolean(location.state?.openPlantPhotoUpload));
  const [isScheduleSettingsOpen, setIsScheduleSettingsOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleSaveError, setScheduleSaveError] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [isSpeakingTips, setIsSpeakingTips] = useState(false);
  const [tipsSpeechError, setTipsSpeechError] = useState("");
  const photoTipsUtteranceRef = useRef(null);
  const activeScheduleDraft = scheduleDraft?.crop === crop ? scheduleDraft : null;
  const scheduleMode = activeScheduleDraft?.mode || schedule?.mode || "auto";
  const intervalDays = activeScheduleDraft?.intervalDays || String(schedule?.interval_days || 5);
  const sortedPhotos = [...photos].sort((a, b) => b.date.localeCompare(a.date));
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId);

  useEffect(() => {
    if (location.state?.openPlantPhotoUpload) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => () => {
    photoTipsUtteranceRef.current = null;
    window.speechSynthesis?.cancel();
  }, []);

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
      const analysis = await analyzePlantPhoto(selectedFile, t, { crop, weather });
      if (analysis.schedule) onScheduleChange(analysis.schedule);
      const photo = {
        id: crypto.randomUUID(),
        date: formatInputDate(today),
        photoUrl: photoPreview,
        analysis: {
          ...analysis,
          schedule: undefined,
          disclaimer: t("plantHealthDisclaimer")
        }
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

  async function savePhotoSchedule(event) {
    event.preventDefault();
    setIsSavingSchedule(true);
    setScheduleSaveError("");
    const requestedInterval = Number(intervalDays);
    try {
      const updatedSchedule = await updatePhotoSchedule({
        crop,
        weather,
        mode: scheduleMode,
        intervalDays: requestedInterval,
        t
      });
      onScheduleChange(updatedSchedule);
      setScheduleDraft(null);
      setIsScheduleSettingsOpen(false);
    } catch (error) {
      if (isOfflineRequestError(error)) {
        const offlineSchedule = createOfflinePhotoSchedule(
          schedule,
          crop,
          scheduleMode,
          requestedInterval
        );
        try {
          localStorage.setItem(
            photoSchedulePendingKey(ownerEmail, crop),
            JSON.stringify({ mode: scheduleMode, interval_days: requestedInterval })
          );
          onScheduleChange(offlineSchedule);
          setScheduleSaveError(t("photoReminderOfflineSaved"));
          setIsScheduleSettingsOpen(false);
        } catch (storageError) {
          console.error("Could not save the photo reminder offline.", storageError);
          setScheduleSaveError(t("photoScheduleSaveFailed"));
        }
      } else {
        setScheduleSaveError(error instanceof Error ? error.message : t("photoScheduleSaveFailed"));
      }
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function enablePhotoNotifications() {
    setNotificationMessage("");
    if (!("Notification" in window)) {
      setNotificationMessage(t("photoNotificationsUnsupported"));
      return;
    }
    try {
      const permission = await window.Notification.requestPermission();
      if (permission === "granted") {
        setNotificationMessage(t("photoNotificationsEnabled"));
        showDuePhotoNotification(schedule, t);
      } else {
        setNotificationMessage(t("photoNotificationsDenied"));
      }
    } catch (error) {
      console.error("Could not request photo reminder notifications.", error);
      setNotificationMessage(t("photoNotificationsDenied"));
    }
  }

  function listenToPhotoTips() {
    if (isSpeakingTips) {
      photoTipsUtteranceRef.current = null;
      window.speechSynthesis?.cancel();
      setIsSpeakingTips(false);
      return;
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setTipsSpeechError(t("photoTipsSpeechUnavailable"));
      return;
    }

    setTipsSpeechError("");
    const speech = window.speechSynthesis;
    const tipKeys = ["photoTipMorning", "photoTipClose", "photoTipSamePlant", "photoTipSteady"];
    const utterance = new window.SpeechSynthesisUtterance(
      tipKeys.map((key) => translate("mr", key)).join(" ")
    );
    utterance.lang = "mr-IN";
    utterance.rate = 0.9;
    const voice = speech.getVoices().find((item) => item.lang.toLowerCase().replaceAll("_", "-") === "mr-in")
      || speech.getVoices().find((item) => item.lang.toLowerCase().replaceAll("_", "-").startsWith("mr-"));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (photoTipsUtteranceRef.current === utterance) setIsSpeakingTips(true);
    };
    utterance.onend = () => {
      if (photoTipsUtteranceRef.current !== utterance) return;
      photoTipsUtteranceRef.current = null;
      setIsSpeakingTips(false);
    };
    utterance.onerror = (event) => {
      if (photoTipsUtteranceRef.current !== utterance) return;
      photoTipsUtteranceRef.current = null;
      setIsSpeakingTips(false);
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setTipsSpeechError(t("photoTipsSpeechFailed"));
      }
    };
    try {
      speech.cancel();
      speech.resume();
      photoTipsUtteranceRef.current = utterance;
      speech.speak(utterance);
    } catch (error) {
      console.error("Could not start spoken photo tips.", error);
      photoTipsUtteranceRef.current = null;
      setIsSpeakingTips(false);
      setTipsSpeechError(t("photoTipsSpeechFailed"));
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

      <PhotoReminderCard schedule={schedule} error={scheduleSaveError || scheduleError} t={t}>
        <button type="button" className="ks-primary-button" onClick={() => setIsUploadOpen(true)}>
          {t("takePhoto")}
        </button>
        <button
          type="button"
          className="ks-secondary-button"
          onClick={() => setIsScheduleSettingsOpen(true)}
        >
          {t("photoReminderSettings")}
        </button>
      </PhotoReminderCard>

      <section className="ks-panel ks-photo-tips" aria-labelledby="photo-tips-title">
        <div className="ks-panel-heading">
          <h2 id="photo-tips-title">{t("photoTipsTitle")}</h2>
          <button
            type="button"
            className="ks-secondary-button"
            onClick={listenToPhotoTips}
            aria-pressed={isSpeakingTips}
          >
            {isSpeakingTips ? t("stopPhotoTips") : t("listenToPhotoTips")}
          </button>
        </div>
        <ul>
          {["photoTipMorning", "photoTipClose", "photoTipSamePlant", "photoTipSteady"].map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        {tipsSpeechError && <p className="ks-form-error" role="status">{tipsSpeechError}</p>}
      </section>

      {isScheduleSettingsOpen && (
        <div
          className="ks-photo-settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsScheduleSettingsOpen(false);
          }}
        >
          <section
            className="ks-panel ks-photo-settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-settings-title"
          >
            <div className="ks-panel-heading">
              <h2 id="photo-settings-title">{t("photoReminderSettings")}</h2>
              <button
                type="button"
                className="ks-close-button"
                onClick={() => setIsScheduleSettingsOpen(false)}
                aria-label={t("close")}
              >×</button>
            </div>
            <form className="ks-photo-schedule-controls" onSubmit={savePhotoSchedule}>
              <label>
                {t("photoReminderMode")}
                <select
                  value={scheduleMode}
                  onChange={(event) => setScheduleDraft({
                    crop,
                    mode: event.target.value,
                    intervalDays
                  })}
                >
                  <option value="auto">{t("photoReminderAuto")}</option>
                  <option value="manual">{t("photoReminderManual")}</option>
                </select>
              </label>
              {scheduleMode === "manual" && (
                <label>
                  {t("photoReminderInterval")}
                  <select
                    required
                    value={intervalDays}
                    onChange={(event) => setScheduleDraft({
                      crop,
                      mode: scheduleMode,
                      intervalDays: event.target.value
                    })}
                  >
                    {Array.from({ length: 14 }, (_, index) => String(index + 1)).map((days) => (
                      <option key={days} value={days}>
                        {days} {t("daysLabel")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {scheduleSaveError && (
                <p className="ks-form-error" role="alert">{scheduleSaveError}</p>
              )}
              <button type="submit" className="ks-primary-button" disabled={isSavingSchedule}>
                {isSavingSchedule ? t("saving") : t("savePhotoReminder")}
              </button>
            </form>
            <div className="ks-photo-notification-settings">
              <button
                type="button"
                className="ks-secondary-button"
                onClick={enablePhotoNotifications}
              >
                {t("enablePhotoNotifications")}
              </button>
              {notificationMessage && <p role="status">{notificationMessage}</p>}
            </div>
          </section>
        </div>
      )}

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
          {sortedPhotos.length ? sortedPhotos.map((photo) => (
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
          )) : (
            <PageEmptyState title={t("plantPhotosEmptyTitle")} description={t("plantPhotosEmptyMessage")} action={t("takePhotoNow")} onAction={() => setIsUploadOpen(true)} />
          )}
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
      const parsedBatch = decodeSharedBatch(sharedBatch);
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
          <HelpButton pageKey="helpPublicTrace" />
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
          ) : (
            <PageEmptyState title={t("noInputsRecorded")} description={t("publicInputsEmptyMessage")} action={t("backToBhoomitra")} to="/dashboard" />
          )}
        </section>
        <footer className="ks-public-footer"><span className="ks-brand-icon">B</span><span>Bhoomitra</span><p>{t("traceFooter")}</p></footer>
      </div>
    </main>
  );
}

export default BhoomitraApp;
