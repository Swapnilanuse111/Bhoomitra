const API_URL = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:8000`;

async function parseResponse(response) {
  const result = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = result?.error
      || result?.detail
      || Object.values(result || {}).flat().find((value) => typeof value === "string")
      || "The request could not be completed.";
    throw new Error(errorMessage);
  }

  return result;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  return parseResponse(response);
}

async function csrfHeaders() {
  const { csrfToken } = await request("/api/auth/csrf/");
  return { "X-CSRFToken": csrfToken };
}

export function getCurrentUser() {
  return request("/api/auth/me/").then((result) => result.user);
}

export async function updateFarmerProfile(profile) {
  return request("/api/auth/profile/", {
    method: "PUT",
    headers: await csrfHeaders(),
    body: JSON.stringify(profile)
  });
}

export async function changeFarmerPassword({ currentPassword, newPassword, confirmPassword }) {
  return request("/api/auth/password/", {
    method: "POST",
    headers: await csrfHeaders(),
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
  });
}

export async function registerFarmer({ name, email, password }) {
  return request("/api/auth/register/", {
    method: "POST",
    headers: await csrfHeaders(),
    body: JSON.stringify({ name, email, password })
  });
}

export async function loginFarmer({ email, password, rememberMe }) {
  return request("/api/auth/login/", {
    method: "POST",
    headers: await csrfHeaders(),
    body: JSON.stringify({ email, password, rememberMe })
  });
}

export async function logoutFarmer() {
  return request("/api/auth/logout/", {
    method: "POST",
    headers: await csrfHeaders()
  });
}

export function getCropLog() {
  return request("/api/crop-log/");
}

export async function createCropLogEntry(entry) {
  return request("/api/crop-log/", {
    method: "POST",
    headers: await csrfHeaders(),
    body: JSON.stringify(entry)
  });
}
