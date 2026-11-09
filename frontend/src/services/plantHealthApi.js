import { getCsrfHeaders } from "./farmerApi.js";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function getPlantHealthErrorKey(message) {
  if (message?.includes("5 MB")) return "plantPhotoTooLarge";
  if (message?.includes("वैध फोटो")) return "invalidPlantPhoto";
  if (message?.includes("Trained model") || message?.includes("Trained model सापडलं")) {
    return "plantModelUnavailable";
  }
  if (message?.includes("image") || message?.includes("फोटो")) return "plantPhotoMissing";
  return "plantHealthAnalysisFailed";
}

export async function analyzePhoto(file, t, { crop, weather } = {}) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("crop", crop || "pomegranate");
  appendWeather(formData, weather);

  let response;
  try {
    response = await fetch(`${API_URL}/api/plant-health/analyze/`, {
      method: "POST",
      credentials: "include",
      headers: await getCsrfHeaders(),
      body: formData
    });
  } catch (error) {
    throw new Error(t("plantHealthConnectionError"), { cause: error });
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = getResponseError(result);
    const errorKey = getPlantHealthErrorKey(message);
    if (errorKey === "plantHealthAnalysisFailed" && message) {
      console.error("Plant health analysis failed.", message);
    }
    throw new Error(t(errorKey), { cause: message ? new Error(message) : undefined });
  }

  return result;
}

function getResponseError(result) {
  if (typeof result?.error === "string") return result.error;
  return Object.values(result || {})
    .flat()
    .find((value) => typeof value === "string") || "";
}

function scheduleUrl(crop, weather) {
  const params = new URLSearchParams({ crop: crop || "pomegranate" });
  if (weather?.weatherCodes?.length) {
    params.set("weather_codes", weather.weatherCodes.join(","));
  }
  if (Number.isFinite(weather?.humidity)) params.set("humidity", String(weather.humidity));
  if (Number.isFinite(weather?.rainChance)) params.set("rain_chance", String(weather.rainChance));
  return `${API_URL}/api/plant-health/schedule/?${params}`;
}

function appendWeather(formData, weather) {
  if (weather?.weatherCodes?.length) {
    formData.append("weather_codes", weather.weatherCodes.join(","));
  }
  if (Number.isFinite(weather?.humidity)) formData.append("humidity", String(weather.humidity));
  if (Number.isFinite(weather?.rainChance)) formData.append("rain_chance", String(weather.rainChance));
}

async function readScheduleResponse(response, t) {
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const rawError = getResponseError(result);
    console.error("Photo reminder API request failed.", rawError || response.status);
    throw new Error(response.status === 403
      ? t("photoScheduleAuthenticationRequired")
      : response.status === 400
        ? t("photoScheduleInvalidSettings")
        : t("photoScheduleRequestFailed"));
  }
  return result;
}

export async function getPhotoSchedule({ crop, weather, t }) {
  let response;
  try {
    response = await fetch(scheduleUrl(crop, weather), { credentials: "include" });
  } catch (error) {
    throw new Error(t("photoReminderConnectionError"), { cause: error });
  }
  return readScheduleResponse(response, t);
}

export async function updatePhotoSchedule({ crop, weather, mode, intervalDays, t }) {
  let response;
  try {
    response = await fetch(scheduleUrl(crop, weather), {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...await getCsrfHeaders()
      },
      body: JSON.stringify({ mode, interval_days: intervalDays })
    });
  } catch (error) {
    throw new Error(t("photoReminderConnectionError"), { cause: error });
  }
  return readScheduleResponse(response, t);
}
