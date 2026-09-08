/**
 * Environment configuration utility
 * Supports both build-time (process.env) and runtime (window._env_) variables
 *
 * Priority: window._env_ > process.env
 */

const getEnv = (key: string, defaultValue: string = "") => {
  // Check runtime environment variables first (window._env_)
  if ((window as any)._env_ && (window as any)._env_[key] !== undefined) {
    return (window as any)._env_[key]
  }

  // Fallback to build-time environment variables
  if (process.env[key] !== undefined) {
    return process.env[key]
  }

  // Return default value if not found
  return defaultValue
}

// Export all environment variables with their getters
export const env = {
  // API Configuration
  LOCAL_PROXY: () => getEnv("REACT_APP_LOCAL_PROXY", "http://localhost:8000"),
  WEBSOCKET_HOST: () => getEnv("REACT_APP_WEBSOCKET_HOST", "localhost:8000"),

  // Retry Configuration
  WEBSOCKET_RETRY_NUM: () => parseInt(getEnv("REACT_APP_WEBSOCKET_RETRY_NUM", "2"), 10),
  WEBSOCKET_RECONNECT_INTERVAL: () => parseInt(getEnv("REACT_APP_WEBSOCKET_RECONNECT_INTERVAL", "3000"), 10),
  S3_UPLOAD_RETRY_NUM: () => parseInt(getEnv("REACT_APP_S3_UPLOAD_RETRY_NUM", "3"), 10),

  // Language
  DEFAULT_LANGUAGE: () => getEnv("REACT_APP_DEFAULT_LANGUAGE", "en"),

  // Paths
  ROOT_PATH: () => getEnv("REACT_APP_ROOT_PATH", ""),

  WS_PROTOCOL: () => getEnv("REACT_APP_WS_PROTOCOL", "wss"),

  AUTH_METHOD: () => getEnv("REACT_APP_AUTH_METHOD", "url"),

  AUTH_ROUTE: () => getEnv("REACT_APP_AUTH_ROUTE", "/api/shikshalokam/read-elevate-profile/"),

  ONBOARDING_REDIRECT_DELAY: () => parseInt(getEnv("REACT_APP_ONBOARDING_REDIRECT_DELAY", "3000"), 10),

  // Login redirect configuration
  SAATHI_FE_URL: () => getEnv("REACT_APP_SAATHI_FE_URL", ""),
  LOGIN_REDIRECT_URL: () => getEnv("REACT_APP_LOGIN_REDIRECT_URL", ""),
  REDIRECT_URL_PATH: () => getEnv("REACT_APP_REDIRECT_URL_PATH", ""),
  FLOW_NAME: () => getEnv("REACT_APP_FLOW_NAME", ""),
  PROFILE_FLOW_NAME: () => getEnv("REACT_APP_PROFILE_FLOW_NAME", "saathi_profile"),
  PROFILE_BOT_ROUTE: () => getEnv("REACT_APP_PROFILE_BOT_ROUTE", "/saathi-profile"),

  // WebSocket error source identifier
  WS_ERROR_SOURCE: () => getEnv("REACT_APP_WS_ERROR_SOURCE", "system"),

  // WebSocket idle timeout identifiers
  WS_IDLE_TIMEOUT_SOURCE: () => getEnv("REACT_APP_WS_IDLE_TIMEOUT_SOURCE", "system"),
  WS_IDLE_TIMEOUT_EVENT: () => getEnv("REACT_APP_WS_IDLE_TIMEOUT_EVENT", "idle_timeout"),

  // Generic getter for any environment variable
  get: (key: string, defaultValue: string = "") => getEnv(key, defaultValue),
}

export default env