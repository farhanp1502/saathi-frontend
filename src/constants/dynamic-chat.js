/**
 * Chat message source identifiers
 * Used to distinguish between bot and user messages throughout chatHistory.
 */
export const CHAT_SOURCE = {
  BOT: "bot",
  USER: "user",
}

/**
 * Special / reserved updated_at IDs that are not real chat messages.
 * Used to skip or filter these entries in history processing.
 */
export const CHAT_SPECIAL_IDS = {
  INTRO_MSG: "intro_msg_id",
}

/**
 * Feedback types for chat messages
 */
export const FEEDBACK_TYPE = {
  THUMBS_UP: "thumbs_up",
  THUMBS_DOWN: "thumbs_down",
}

/**
 * Feedback payload default structures
 */
export const DESELECT_FEEDBACK_PAYLOAD = {
  thumbs_up: false,
  thumbs_down: false,
  comment: "",
}

export const FEEDBACK_PAYLOAD = {
  DESELECT: DESELECT_FEEDBACK_PAYLOAD,
}

/**
 * Chat source search type identifiers
 */
export const SOURCE_TYPE = {
  WEB_SEARCH: "web_search",
  KB_SEARCH: "kb_search",
}

/**
 * Default source logos
 */
export const DEFAULT_SOURCE_LOGO = "/assets/source_logo.svg"