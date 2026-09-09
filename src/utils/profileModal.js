import { create } from "zustand"

/**
 * Global store for controlling the User Profile Modal visibility.
 */
export const useProfileModalStore = create((set) => ({
  showProfileModal: false,
  setShowProfileModal: (show) => set({ showProfileModal: Boolean(show) }),
}))

/**
 * Generic helper to open or close the User Profile Modal from anywhere
 * (inside React components, callbacks, or outside React e.g. API endpoints).
 *
 * @example
 * setShowProfileModal(true)  // opens the popup
 * setShowProfileModal(false) // closes the popup
 *
 * @param {boolean} show - true to open, false to close
 */
export const setShowProfileModal = (show) => {
  useProfileModalStore.getState().setShowProfileModal(show)
}
