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

export async function analyzePhoto(file, t) {
  const formData = new FormData();
  formData.append("image", file);

  let response;
  try {
    response = await fetch(`${API_URL}/api/plant-health/analyze/`, {
      method: "POST",
      body: formData
    });
  } catch (error) {
    throw new Error(t("plantHealthConnectionError"), { cause: error });
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.error;
    const errorKey = getPlantHealthErrorKey(message);
    if (errorKey === "plantHealthAnalysisFailed" && message) {
      console.error("Plant health analysis failed.", message);
    }
    throw new Error(t(errorKey), { cause: message ? new Error(message) : undefined });
  }

  return result;
}
