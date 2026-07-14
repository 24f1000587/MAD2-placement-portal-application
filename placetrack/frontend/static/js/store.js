// Small hand-rolled store (no Vuex/Pinia needed for a project this size).
// Vue's reactive() is enough to share auth state across every component.
const { reactive } = Vue;

const STORAGE_KEY = 'placetrack.session';

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

const saved = loadSession();

export const authStore = reactive({
  token: saved ? saved.token : null,
  user: saved ? saved.user : null,
  profile: saved ? saved.profile : null,
});

export function loginSuccess({ token, user, profile }) {
  authStore.token = token;
  authStore.user = user;
  authStore.profile = profile || null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, profile: profile || null }));
}

export function updateStoredProfile(profile) {
  authStore.profile = profile;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token: authStore.token, user: authStore.user, profile })
  );
}

export function logout() {
  authStore.token = null;
  authStore.user = null;
  authStore.profile = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated() {
  return !!authStore.token;
}

export function hasRole(role) {
  return authStore.user && authStore.user.role === role;
}
