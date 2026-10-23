import { useEffect, useState } from "react";
import { changeFarmerPassword, updateFarmerProfile } from "../services/farmerApi.js";
import { languages } from "./localization.js";
import "./account-settings.css";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function readPreference(key, fallback) {
  const savedValue = localStorage.getItem(`bhoomitra-setting-${key}`);
  return savedValue === null ? fallback : savedValue === "true";
}

function AccountSettings({ user, onUserUpdated, onSignOut, language, setLanguage, t }) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [avatarData, setAvatarData] = useState(user.avatarData || "");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [preferences, setPreferences] = useState(() => ({
    largeText: readPreference("large-text", false),
    highContrast: readPreference("high-contrast", false),
    reducedMotion: readPreference(
      "reduced-motion",
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  }));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = preferences.largeText ? "large" : "normal";
    root.dataset.highContrast = String(preferences.highContrast);
    root.dataset.reducedMotion = String(preferences.reducedMotion);
    localStorage.setItem("bhoomitra-setting-large-text", String(preferences.largeText));
    localStorage.setItem("bhoomitra-setting-high-contrast", String(preferences.highContrast));
    localStorage.setItem("bhoomitra-setting-reduced-motion", String(preferences.reducedMotion));
  }, [preferences]);

  function cancelProfileEdit() {
    setProfileName(user.name);
    setProfileEmail(user.email);
    setAvatarData(user.avatarData || "");
    setProfileError("");
    setProfileSuccess("");
    setIsEditingProfile(false);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    const normalizedName = profileName.trim();
    const normalizedEmail = profileEmail.trim().toLowerCase();
    if (!normalizedName || normalizedName.length > 80) {
      setProfileError(t("profileNameValidation"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      setProfileError(t("profileEmailValidation"));
      return;
    }

    setIsSavingProfile(true);
    try {
      const updatedUser = await updateFarmerProfile({
        name: normalizedName,
        email: normalizedEmail,
        avatarData
      });
      onUserUpdated(updatedUser);
      setProfileName(updatedUser.name);
      setProfileEmail(updatedUser.email);
      setAvatarData(updatedUser.avatarData || "");
      setProfileSuccess(t("profileSaved"));
      setIsEditingProfile(false);
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  function selectAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProfileError(t("avatarFormatError"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setProfileError(t("avatarSizeError"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarData(reader.result);
        setProfileError("");
      } else {
        setProfileError(t("avatarReadError"));
      }
    };
    reader.onerror = () => setProfileError(t("avatarReadError"));
    reader.readAsDataURL(file);
  }

  function updatePasswordField(field, value) {
    setPasswords((current) => ({ ...current, [field]: value }));
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (!passwords.currentPassword) {
      setPasswordError(t("currentPasswordRequired"));
      return;
    }
    if (passwords.newPassword.length < 8) {
      setPasswordError(t("passwordMinLength"));
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError(t("passwordMismatch"));
      return;
    }

    setIsSavingPassword(true);
    try {
      await changeFarmerPassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setVisiblePasswords({});
      setPasswordSuccess(t("passwordUpdated"));
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");
    try {
      await onSignOut();
    } catch (error) {
      setSignOutError(error.message);
      setIsSigningOut(false);
    }
  }

  function togglePasswordVisibility(field) {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  }

  function renderPasswordField(field, label) {
    const visible = Boolean(visiblePasswords[field]);
    return (
      <label className="ks-setting-field" key={field}>
        <span>{label}</span>
        <span className="ks-setting-password-control">
          <input
            type={visible ? "text" : "password"}
            value={passwords[field]}
            onChange={(event) => updatePasswordField(field, event.target.value)}
            autoComplete={field === "currentPassword" ? "current-password" : "new-password"}
            required
          />
          <button
            type="button"
            className="ks-setting-password-toggle"
            onClick={() => togglePasswordVisibility(field)}
            aria-label={visible ? t("hidePassword") : t("showPassword")}
          >{visible ? "◉" : "◎"}</button>
        </span>
      </label>
    );
  }

  function updatePreference(name, value) {
    setPreferences((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="ks-settings-page">
      <header className="ks-page-heading">
        <div>
          <h1>{t("accountSettings")}</h1>
          <p>{t("accountSettingsSubtitle")}</p>
        </div>
      </header>

      <section className="ks-panel ks-settings-card" aria-labelledby="settings-profile-title">
        <div className="ks-settings-section-heading">
          <span className="ks-settings-section-icon" aria-hidden="true">♙</span>
          <div><h2 id="settings-profile-title">{t("profileInformation")}</h2><p>{t("profileInformationHelp")}</p></div>
        </div>
        <form onSubmit={saveProfile}>
          <div className="ks-settings-profile-row">
            <div className="ks-settings-avatar-wrap">
              {avatarData
                ? <img className="ks-settings-avatar" src={avatarData} alt={t("profilePhoto")} />
                : <span className="ks-settings-avatar ks-settings-avatar-initials" aria-label={t("profileAvatar")}>{user.name.trim().charAt(0).toUpperCase()}</span>}
              {isEditingProfile && (
                <label className="ks-settings-avatar-upload">
                  <span aria-hidden="true">✎</span>{t("changePhoto")}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} />
                </label>
              )}
            </div>
            <div className="ks-settings-profile-fields">
              <label className="ks-setting-field">
                <span>{t("fullName")}</span>
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} readOnly={!isEditingProfile} maxLength={80} required />
              </label>
              <label className="ks-setting-field">
                <span>{t("emailAddress")}</span>
                <input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} readOnly={!isEditingProfile} maxLength={254} required />
              </label>
              <p className="ks-settings-supported-fields">{t("profileFieldsNote")}</p>
            </div>
          </div>
          {profileError && <p className="ks-settings-message error" role="alert">{profileError}</p>}
          {profileSuccess && <p className="ks-settings-message success" role="status">{profileSuccess}</p>}
          <div className="ks-settings-actions">
            {isEditingProfile ? (
              <>
                <button type="button" className="ks-secondary-button" onClick={cancelProfileEdit} disabled={isSavingProfile}>{t("cancel")}</button>
                <button type="submit" className="ks-primary-button" disabled={isSavingProfile}>
                  {isSavingProfile && <span className="ks-login-spinner" aria-hidden="true" />}
                  {isSavingProfile ? t("saving") : t("saveChanges")}
                </button>
              </>
            ) : (
              <button type="button" className="ks-primary-button" onClick={() => { setProfileError(""); setProfileSuccess(""); setIsEditingProfile(true); }}>{t("editProfile")}</button>
            )}
          </div>
        </form>
      </section>

      <section className="ks-panel ks-settings-card" aria-labelledby="settings-password-title">
        <div className="ks-settings-section-heading">
          <span className="ks-settings-section-icon" aria-hidden="true">⌑</span>
          <div><h2 id="settings-password-title">{t("changePassword")}</h2><p>{t("changePasswordHelp")}</p></div>
        </div>
        <form className="ks-settings-password-form" onSubmit={savePassword}>
          {renderPasswordField("currentPassword", t("currentPassword"))}
          {renderPasswordField("newPassword", t("newPassword"))}
          {renderPasswordField("confirmPassword", t("confirmNewPassword"))}
          <p className="ks-settings-supported-fields">{t("passwordRequirements")}</p>
          {passwordError && <p className="ks-settings-message error" role="alert">{passwordError}</p>}
          {passwordSuccess && <p className="ks-settings-message success" role="status">{passwordSuccess}</p>}
          <div className="ks-settings-actions">
            <button type="submit" className="ks-primary-button" disabled={isSavingPassword}>
              {isSavingPassword && <span className="ks-login-spinner" aria-hidden="true" />}
              {isSavingPassword ? t("updatingPassword") : t("updatePassword")}
            </button>
          </div>
        </form>
      </section>

      <section className="ks-panel ks-settings-card" aria-labelledby="settings-language-title">
        <div className="ks-settings-section-heading">
          <span className="ks-settings-section-icon" aria-hidden="true">文</span>
          <div><h2 id="settings-language-title">{t("languagePreferences")}</h2><p>{t("languagePreferencesHelp")}</p></div>
        </div>
        <label className="ks-setting-field ks-settings-language-field">
          <span>{t("displayLanguage")}</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {languages.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
          </select>
        </label>
      </section>

      <section className="ks-panel ks-settings-card" aria-labelledby="settings-accessibility-title">
        <div className="ks-settings-section-heading">
          <span className="ks-settings-section-icon" aria-hidden="true">◉</span>
          <div><h2 id="settings-accessibility-title">{t("accessibilityPreferences")}</h2><p>{t("accessibilityPreferencesHelp")}</p></div>
        </div>
        <div className="ks-settings-preferences">
          <label className="ks-settings-toggle-row">
            <span><strong>{t("largerText")}</strong><small>{t("largerTextHelp")}</small></span>
            <input type="checkbox" checked={preferences.largeText} onChange={(event) => updatePreference("largeText", event.target.checked)} />
          </label>
          <label className="ks-settings-toggle-row">
            <span><strong>{t("highContrast")}</strong><small>{t("highContrastHelp")}</small></span>
            <input type="checkbox" checked={preferences.highContrast} onChange={(event) => updatePreference("highContrast", event.target.checked)} />
          </label>
          <label className="ks-settings-toggle-row">
            <span><strong>{t("reducedAnimation")}</strong><small>{t("reducedAnimationHelp")}</small></span>
            <input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => updatePreference("reducedMotion", event.target.checked)} />
          </label>
        </div>
      </section>

      <section className="ks-panel ks-settings-card ks-settings-security" aria-labelledby="settings-security-title">
        <div className="ks-settings-section-heading">
          <span className="ks-settings-section-icon" aria-hidden="true">⌑</span>
          <div><h2 id="settings-security-title">{t("accountSecurity")}</h2><p>{t("accountSecurityHelp")}</p></div>
        </div>
        {signOutError && <p className="ks-settings-message error" role="alert">{signOutError}</p>}
        <button type="button" className="ks-settings-logout" onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut && <span className="ks-login-spinner" aria-hidden="true" />}
          {isSigningOut ? t("signingOut") : t("signOut")}
        </button>
      </section>
    </div>
  );
}

export default AccountSettings;
