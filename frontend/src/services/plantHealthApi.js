const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const CONNECTION_ERROR = "सर्व्हरशी संपर्क होऊ शकला नाही";

export async function analyzePhoto(file) {
  const formData = new FormData();
  formData.append("image", file);

  let response;
  try {
    response = await fetch(`${API_URL}/api/plant-health/analyze/`, {
      method: "POST",
      body: formData
    });
  } catch {
    throw new Error(CONNECTION_ERROR);
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || CONNECTION_ERROR);
  }

  return result;
}
